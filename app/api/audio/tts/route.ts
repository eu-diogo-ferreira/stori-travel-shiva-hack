import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUserId } from '@/lib/auth/get-current-user'
import { MAX_TTS_INPUT_CHARS, ttsRequestSchema } from '@/lib/schema/audio'

function isGuestAllowed() {
  return process.env.ENABLE_GUEST_CHAT === 'true'
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function truncateForTts(value: string) {
  return value.slice(0, MAX_TTS_INPUT_CHARS)
}

async function summarizeForTtsIfNeeded(text: string, apiKey: string) {
  const normalized = normalizeWhitespace(text)
  if (normalized.length <= MAX_TTS_INPUT_CHARS) {
    return normalized
  }

  try {
    const summaryResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        input: [
          {
            role: 'system',
            content:
              'You summarize assistant answers for text-to-speech. Keep the most important points, remove redundancy, preserve factual correctness, and output plain text only.'
          },
          {
            role: 'user',
            content: `Summarize the text below for audio playback in at most ${MAX_TTS_INPUT_CHARS} characters:\n\n${normalized}`
          }
        ],
        max_output_tokens: 900
      })
    })

    if (!summaryResponse.ok) {
      return truncateForTts(normalized)
    }

    const summaryPayload = await summaryResponse.json()
    const summaryText = normalizeWhitespace(
      summaryPayload?.output_text || normalized
    )
    if (!summaryText) {
      return truncateForTts(normalized)
    }
    return summaryText.length > MAX_TTS_INPUT_CHARS
      ? truncateForTts(summaryText)
      : summaryText
  } catch {
    return truncateForTts(normalized)
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getCurrentUserId()
    if (!userId && !isGuestAllowed()) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY is not configured' },
        { status: 500 }
      )
    }

    const json = await req.json()
    const parsed = ttsRequestSchema.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid payload',
          details: parsed.error.flatten()
        },
        { status: 400 }
      )
    }

    const payload = parsed.data
    const ttsInput = await summarizeForTtsIfNeeded(
      payload.text,
      process.env.OPENAI_API_KEY
    )

    const openAiResponse = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: ttsInput,
        voice: payload.voice,
        response_format: payload.format,
        speed: payload.speed
      })
    })

    if (!openAiResponse.ok) {
      const errorBody = await openAiResponse
        .json()
        .catch(() => ({ error: { message: 'OpenAI TTS failed' } }))
      const message = errorBody?.error?.message || 'OpenAI TTS request failed'
      return NextResponse.json({ error: message }, { status: 502 })
    }

    const contentType =
      payload.format === 'wav' ? 'audio/wav' : 'audio/mpeg'
    const audioBuffer = await openAiResponse.arrayBuffer()

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store'
      }
    })
  } catch (error) {
    console.error('Audio TTS route error:', error)
    return NextResponse.json(
      { error: 'Failed to generate audio' },
      { status: 500 }
    )
  }
}
