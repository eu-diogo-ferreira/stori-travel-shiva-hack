import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUserId } from '@/lib/auth/get-current-user'
import {
  MAX_AUDIO_DURATION_MS,
  MAX_AUDIO_FILE_SIZE_BYTES,
  SUPPORTED_AUDIO_MIME_TYPES
} from '@/lib/schema/audio'

function isGuestAllowed() {
  return process.env.ENABLE_GUEST_CHAT === 'true'
}

function isSupportedAudioMimeType(mimeType: string) {
  if (!mimeType) return false
  if (SUPPORTED_AUDIO_MIME_TYPES.includes(mimeType as any)) return true
  // Handle codec suffixes such as "audio/webm;codecs=opus"
  const baseType = mimeType.split(';')[0]?.trim()
  return SUPPORTED_AUDIO_MIME_TYPES.includes(baseType as any)
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

    const contentType = req.headers.get('content-type') || ''
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json(
        { error: 'Invalid content type. Expected multipart/form-data' },
        { status: 400 }
      )
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY is not configured' },
        { status: 500 }
      )
    }

    const formData = await req.formData()
    const file = formData.get('file')
    const durationMsRaw = formData.get('durationMs')

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'Audio file is required' },
        { status: 400 }
      )
    }

    if (file.size <= 0) {
      return NextResponse.json(
        { error: 'Audio file is empty' },
        { status: 400 }
      )
    }

    if (file.size > MAX_AUDIO_FILE_SIZE_BYTES) {
      return NextResponse.json(
        {
          error: `Audio file is too large. Max allowed is ${Math.floor(
            MAX_AUDIO_FILE_SIZE_BYTES / (1024 * 1024)
          )}MB`
        },
        { status: 413 }
      )
    }

    if (!isSupportedAudioMimeType(file.type)) {
      return NextResponse.json(
        {
          error: `Unsupported audio MIME type: ${
            file.type || 'unknown'
          }. Allowed: ${SUPPORTED_AUDIO_MIME_TYPES.join(', ')}`
        },
        { status: 415 }
      )
    }

    let durationMs: number | undefined
    if (typeof durationMsRaw === 'string' && durationMsRaw.trim().length > 0) {
      durationMs = Number(durationMsRaw)
      if (!Number.isFinite(durationMs) || durationMs <= 0) {
        return NextResponse.json(
          { error: 'durationMs must be a positive number' },
          { status: 400 }
        )
      }
      if (durationMs > MAX_AUDIO_DURATION_MS) {
        return NextResponse.json(
          {
            error: `Audio duration exceeds the limit of ${
              MAX_AUDIO_DURATION_MS / 1000
            } seconds`
          },
          { status: 400 }
        )
      }
    }

    const openAiForm = new FormData()
    openAiForm.append('model', 'whisper-1')
    openAiForm.append('file', file)
    openAiForm.append('response_format', 'json')

    const openAiResponse = await fetch(
      'https://api.openai.com/v1/audio/transcriptions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: openAiForm
      }
    )

    if (!openAiResponse.ok) {
      const errorBody = await openAiResponse
        .json()
        .catch(() => ({ error: { message: 'OpenAI transcription failed' } }))
      const message =
        errorBody?.error?.message || 'OpenAI transcription request failed'
      return NextResponse.json({ error: message }, { status: 502 })
    }

    const transcription = await openAiResponse.json()
    const text = String(transcription?.text || '').trim()
    if (!text) {
      return NextResponse.json(
        { error: 'Transcription returned empty text' },
        { status: 422 }
      )
    }

    return NextResponse.json(
      {
        text,
        durationMs,
        language:
          typeof transcription?.language === 'string'
            ? transcription.language
            : undefined
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Audio transcription route error:', error)
    return NextResponse.json(
      { error: 'Failed to transcribe audio' },
      { status: 500 }
    )
  }
}
