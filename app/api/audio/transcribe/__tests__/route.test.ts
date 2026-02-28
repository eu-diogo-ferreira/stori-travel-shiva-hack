import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/get-current-user', () => ({
  getCurrentUserId: vi.fn()
}))

import { getCurrentUserId } from '@/lib/auth/get-current-user'

import { POST } from '../route'

describe('POST /api/audio/transcribe', () => {
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

    const request = new Request('http://localhost:3000/api/audio/transcribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data; boundary=---test'
      },
      body: new FormData()
    })

    const response = await POST(request as any)
    expect(response.status).toBe(401)
  })

  it('returns 415 for unsupported mime type', async () => {
    vi.mocked(getCurrentUserId).mockResolvedValue('user-1')
    const formData = new FormData()
    formData.append(
      'file',
      new File([new Uint8Array([1, 2, 3])], 'audio.txt', {
        type: 'text/plain'
      })
    )

    const request = {
      headers: new Headers({
        'content-type': 'multipart/form-data; boundary=---test'
      }),
      formData: async () => formData
    } as any

    const response = await POST(request)
    expect(response.status).toBe(415)
  })

  it('returns 200 with transcribed text', async () => {
    vi.mocked(getCurrentUserId).mockResolvedValue('user-1')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ text: 'hello world', language: 'en' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    )

    const formData = new FormData()
    formData.append(
      'file',
      new File([new Uint8Array([1, 2, 3])], 'audio.webm', {
        type: 'audio/webm'
      })
    )
    formData.append('durationMs', '5000')

    const request = {
      headers: new Headers({
        'content-type': 'multipart/form-data; boundary=---test'
      }),
      formData: async () => formData
    } as any

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.text).toBe('hello world')
    expect(json.language).toBe('en')
    expect(json.durationMs).toBe(5000)
  })
})
