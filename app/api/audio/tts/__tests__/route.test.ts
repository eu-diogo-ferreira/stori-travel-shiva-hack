import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/get-current-user', () => ({
  getCurrentUserId: vi.fn()
}))

import { getCurrentUserId } from '@/lib/auth/get-current-user'

import { POST } from '../route'

describe('POST /api/audio/tts', () => {
  const originalEnv = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ENABLE_GUEST_CHAT: process.env.ENABLE_GUEST_CHAT
  }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.OPENAI_API_KEY = 'test-openai-key'
    process.env.ENABLE_GUEST_CHAT = 'false'
  })

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalEnv.OPENAI_API_KEY
    process.env.ENABLE_GUEST_CHAT = originalEnv.ENABLE_GUEST_CHAT
    vi.unstubAllGlobals()
  })

  it('returns 401 when unauthenticated and guest chat is disabled', async () => {
    vi.mocked(getCurrentUserId).mockResolvedValue(undefined)

    const request = new Request('http://localhost:3000/api/audio/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'hello' })
    })

    const response = await POST(request as any)
    expect(response.status).toBe(401)
  })

  it('returns 400 for invalid payload', async () => {
    vi.mocked(getCurrentUserId).mockResolvedValue('user-1')

    const request = new Request('http://localhost:3000/api/audio/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '' })
    })

    const response = await POST(request as any)
    expect(response.status).toBe(400)
  })

  it('returns audio bytes for valid request', async () => {
    vi.mocked(getCurrentUserId).mockResolvedValue('user-1')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
          headers: { 'Content-Type': 'audio/mpeg' }
        })
      )
    )

    const request = new Request('http://localhost:3000/api/audio/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Hello from assistant',
        voice: 'alloy',
        format: 'mp3'
      })
    })

    const response = await POST(request as any)
    const arrayBuffer = await response.arrayBuffer()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('audio/mpeg')
    expect(arrayBuffer.byteLength).toBeGreaterThan(0)
  })
})
