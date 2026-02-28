import { z } from 'zod'

export const MAX_AUDIO_DURATION_MS = 2 * 60 * 1000
export const MAX_AUDIO_FILE_SIZE_BYTES = 10 * 1024 * 1024
export const MAX_TTS_INPUT_CHARS = 4096

export const SUPPORTED_AUDIO_MIME_TYPES = [
  'audio/webm',
  'audio/wav',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/ogg'
] as const

export const ttsRequestSchema = z.object({
  // Allow larger payloads; endpoint will summarize/truncate to provider limits.
  text: z.string().min(1).max(20000),
  voice: z
    .enum([
      'alloy',
      'ash',
      'ballad',
      'coral',
      'echo',
      'fable',
      'nova',
      'onyx',
      'sage',
      'shimmer'
    ])
    .default('alloy'),
  format: z.enum(['mp3', 'wav']).default('mp3'),
  speed: z.number().min(0.25).max(4).optional()
})

export type TtsRequest = z.infer<typeof ttsRequestSchema>
