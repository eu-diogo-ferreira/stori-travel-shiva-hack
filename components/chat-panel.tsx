'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Textarea from 'react-textarea-autosize'
import { useRouter } from 'next/navigation'

import { UseChatHelpers } from '@ai-sdk/react'
import {
  ArrowUp,
  ChevronDown,
  Loader2,
  MessageCirclePlus,
  Mic,
  Square
} from 'lucide-react'
import { toast } from 'sonner'

import { UploadedFile } from '@/lib/types'
import type { UIDataTypes, UIMessage, UITools } from '@/lib/types/ai'
import { cn } from '@/lib/utils'

import { useArtifact } from './artifact/artifact-context'
import { Button } from './ui/button'
import { IconBlinkingLogo } from './ui/icons'
import { ActionButtons } from './action-buttons'
import { FileUploadButton } from './file-upload-button'
import { ModelTypeSelector } from './model-type-selector'
import { SearchModeSelector } from './search-mode-selector'
import { UploadedFileList } from './uploaded-file-list'

// Constants for timing delays
const INPUT_UPDATE_DELAY_MS = 10 // Delay to ensure input value is updated before form submission
const MAX_AUDIO_DURATION_MS = 2 * 60 * 1000
const RECORDING_TIMER_TICK_MS = 250

type MicState = 'idle' | 'recording' | 'processing'

interface ChatPanelProps {
  chatId: string
  input: string
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  status: UseChatHelpers<UIMessage<unknown, UIDataTypes, UITools>>['status']
  messages: UIMessage[]
  setMessages: (messages: UIMessage[]) => void
  query?: string
  stop: () => void
  append: (message: any) => void
  /** Whether to show the scroll to bottom button */
  showScrollToBottomButton: boolean
  /** Reference to the scroll container */
  scrollContainerRef: React.RefObject<HTMLDivElement>
  uploadedFiles: UploadedFile[]
  setUploadedFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>
  /** Callback to reset chatId when starting a new chat */
  onNewChat?: () => void
  /** Whether the current session is guest */
  isGuest?: boolean
  /** Called after successful speech-to-text transcription */
  onAudioTranscription?: (payload: {
    text: string
    durationMs?: number
    mimeType?: string
  }) => void | Promise<void>
}

export function ChatPanel({
  chatId,
  input,
  handleInputChange,
  handleSubmit,
  status,
  messages,
  setMessages,
  query,
  stop,
  append,
  showScrollToBottomButton,
  uploadedFiles,
  setUploadedFiles,
  scrollContainerRef,
  onNewChat,
  isGuest = false,
  onAudioTranscription
}: ChatPanelProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const isFirstRender = useRef(true)
  const [isComposing, setIsComposing] = useState(false) // Composition state
  const [enterDisabled, setEnterDisabled] = useState(false) // Disable Enter after composition ends
  const [isInputFocused, setIsInputFocused] = useState(false) // Track input focus
  const [micState, setMicState] = useState<MicState>('idle')
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0)
  const { close: closeArtifact } = useArtifact()
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingStartRef = useRef<number | null>(null)
  const recordingStopTimeoutRef = useRef<number | null>(null)
  const recordingTimerRef = useRef<number | null>(null)
  const isLoading = status === 'submitted' || status === 'streaming'

  const handleCompositionStart = () => setIsComposing(true)

  const handleCompositionEnd = () => {
    setIsComposing(false)
    setEnterDisabled(true)
    setTimeout(() => {
      setEnterDisabled(false)
    }, 300)
  }

  const handleNewChat = () => {
    setMessages([])
    closeArtifact()
    // Reset focus state when clearing chat
    setIsInputFocused(false)
    inputRef.current?.blur()
    // Reset chatId in parent component
    onNewChat?.()
    router.push('/')
  }

  const isToolInvocationInProgress = () => {
    if (!messages.length) return false

    const lastMessage = messages[messages.length - 1]
    if (lastMessage.role !== 'assistant' || !lastMessage.parts) return false

    const parts = lastMessage.parts
    const lastPart = parts[parts.length - 1]

    return (
      (lastPart?.type === 'tool-search' ||
        lastPart?.type === 'tool-fetch' ||
        lastPart?.type === 'tool-askQuestion') &&
      ((lastPart as any)?.state === 'input-streaming' ||
        (lastPart as any)?.state === 'input-available')
    )
  }

  // if query is not empty, submit the query
  useEffect(() => {
    if (isFirstRender.current && query && query.trim().length > 0) {
      append({
        role: 'user',
        content: query
      })
      isFirstRender.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const handleFileRemove = useCallback(
    (index: number) => {
      setUploadedFiles(prev => prev.filter((_, i) => i !== index))
    },
    [setUploadedFiles]
  )
  // Scroll to the bottom of the container
  const handleScrollToBottom = () => {
    const scrollContainer = scrollContainerRef.current
    if (scrollContainer) {
      scrollContainer.scrollTo({
        top: scrollContainer.scrollHeight,
        behavior: 'smooth'
      })
    }
  }

  const resetRecordingTimers = useCallback(() => {
    if (recordingStopTimeoutRef.current !== null) {
      window.clearTimeout(recordingStopTimeoutRef.current)
      recordingStopTimeoutRef.current = null
    }
    if (recordingTimerRef.current !== null) {
      window.clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
  }, [])

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (!recorder) return
    if (recorder.state === 'recording') {
      recorder.stop()
    }
  }, [])

  const transcribeAudioBlob = useCallback(
    async (audioBlob: Blob, durationMs?: number) => {
      const formData = new FormData()
      const extension = audioBlob.type.includes('wav') ? 'wav' : 'webm'
      const file = new File([audioBlob], `recording.${extension}`, {
        type: audioBlob.type || 'audio/webm'
      })
      formData.append('file', file)
      if (durationMs !== undefined) {
        formData.append('durationMs', String(durationMs))
      }

      const response = await fetch('/api/audio/transcribe', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        const payload = await response
          .json()
          .catch(() => ({ error: 'Transcription failed' }))
        throw new Error(payload?.error || 'Transcription failed')
      }

      const payload = await response.json()
      const transcriptText = String(payload?.text || '').trim()
      if (!transcriptText) {
        throw new Error('Could not transcribe audio')
      }

      await onAudioTranscription?.({
        text: transcriptText,
        durationMs,
        mimeType: audioBlob.type || file.type
      })
    },
    [onAudioTranscription]
  )

  const startRecording = useCallback(async () => {
    if (micState !== 'idle') return
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof MediaRecorder === 'undefined'
    ) {
      toast.error('Audio recording is not supported in this browser')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const preferredMimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/wav'
      ]
      const supportedMimeType = preferredMimeTypes.find(type =>
        MediaRecorder.isTypeSupported(type)
      )
      const recorder = supportedMimeType
        ? new MediaRecorder(stream, { mimeType: supportedMimeType })
        : new MediaRecorder(stream)

      audioChunksRef.current = []
      recordingStartRef.current = Date.now()
      setRecordingElapsedMs(0)
      setMicState('recording')
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = event => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      recorder.onstop = async () => {
        resetRecordingTimers()
        const startedAt = recordingStartRef.current
        const durationMs = startedAt ? Date.now() - startedAt : undefined
        const chunks = [...audioChunksRef.current]
        audioChunksRef.current = []
        recordingStartRef.current = null

        for (const track of stream.getTracks()) {
          track.stop()
        }

        if (chunks.length === 0) {
          setMicState('idle')
          return
        }

        const audioBlob = new Blob(chunks, {
          type: recorder.mimeType || 'audio/webm'
        })

        setMicState('processing')
        try {
          await transcribeAudioBlob(audioBlob, durationMs)
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Failed to transcribe audio'
          toast.error(message)
        } finally {
          setMicState('idle')
          setRecordingElapsedMs(0)
        }
      }

      recorder.start(200)
      recordingStopTimeoutRef.current = window.setTimeout(() => {
        stopRecording()
      }, MAX_AUDIO_DURATION_MS)
      recordingTimerRef.current = window.setInterval(() => {
        const startedAt = recordingStartRef.current
        if (!startedAt) return
        setRecordingElapsedMs(Date.now() - startedAt)
      }, RECORDING_TIMER_TICK_MS)
    } catch (error) {
      console.error('Audio recording error:', error)
      toast.error('Could not access microphone')
      setMicState('idle')
      resetRecordingTimers()
    }
  }, [micState, resetRecordingTimers, stopRecording, transcribeAudioBlob])

  useEffect(
    () => () => {
      resetRecordingTimers()
      const recorder = mediaRecorderRef.current
      if (recorder && recorder.state === 'recording') {
        recorder.stop()
      }
    },
    [resetRecordingTimers]
  )

  const isRecording = micState === 'recording'
  const isProcessingAudio = micState === 'processing'
  const recordingSeconds = Math.ceil(recordingElapsedMs / 1000)

  return (
    <div
      className={cn(
        'w-full bg-background group/form-container shrink-0',
        messages.length > 0 ? 'sticky bottom-0 px-2 pb-4' : 'px-6'
      )}
    >
      {messages.length === 0 && (
        <div className="mb-10 flex flex-col items-center gap-4">
          <IconBlinkingLogo className="size-12" />
          <h1 className="text-2xl font-medium text-foreground">
            What would you like to know?
          </h1>
        </div>
      )}
      {uploadedFiles.length > 0 && (
        <UploadedFileList files={uploadedFiles} onRemove={handleFileRemove} />
      )}
      <form
        onSubmit={e => {
          handleSubmit(e)
          // Reset focus state after submission
          setIsInputFocused(false)
          inputRef.current?.blur()
        }}
        className={cn('max-w-full md:max-w-3xl w-full mx-auto relative')}
      >
        {/* Scroll to bottom button - only shown when showScrollToBottomButton is true */}
        {showScrollToBottomButton && messages.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="absolute -top-10 right-4 z-20 size-8 rounded-full shadow-md"
            onClick={handleScrollToBottom}
            title="Scroll to bottom"
          >
            <ChevronDown size={16} />
          </Button>
        )}

        <div
          className={cn(
            'relative flex flex-col w-full gap-2 bg-muted rounded-3xl border border-input transition-shadow',
            isInputFocused &&
              'ring-1 ring-ring/20 ring-offset-1 ring-offset-background/50'
          )}
        >
          <Textarea
            ref={inputRef}
            name="input"
            rows={2}
            maxRows={5}
            tabIndex={0}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => setIsInputFocused(false)}
            placeholder="Ask anything..."
            spellCheck={false}
            value={input}
            disabled={isLoading || isToolInvocationInProgress()}
            className="resize-none w-full min-h-12 bg-transparent border-0 p-4 text-sm placeholder:text-muted-foreground focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
            onChange={handleInputChange}
            onKeyDown={e => {
              if (
                e.key === 'Enter' &&
                !e.shiftKey &&
                !isComposing &&
                !enterDisabled
              ) {
                if (input.trim().length === 0) {
                  e.preventDefault()
                  return
                }
                e.preventDefault()
                const textarea = e.target as HTMLTextAreaElement
                textarea.form?.requestSubmit()
                // Reset focus state after Enter key submission
                setIsInputFocused(false)
                textarea.blur()
              }
            }}
          />

          {/* Bottom menu area */}
          <div className="flex items-center justify-between p-3">
            <div className="flex items-center gap-2">
              {!isGuest && (
                <FileUploadButton
                  onFileSelect={async files => {
                    const newFiles: UploadedFile[] = files.map(file => ({
                      file,
                      status: 'uploading'
                    }))
                    setUploadedFiles(prev => [...prev, ...newFiles])
                    await Promise.all(
                      newFiles.map(async uf => {
                        const formData = new FormData()
                        formData.append('file', uf.file)
                        formData.append('chatId', chatId)
                        try {
                          const res = await fetch('/api/upload', {
                            method: 'POST',
                            body: formData
                          })

                          if (!res.ok) {
                            throw new Error('Upload failed')
                          }

                          const { file: uploaded } = await res.json()
                          setUploadedFiles(prev =>
                            prev.map(f =>
                              f.file === uf.file
                                ? {
                                    ...f,
                                    status: 'uploaded',
                                    url: uploaded.url,
                                    name: uploaded.filename,
                                    key: uploaded.key
                                  }
                                : f
                            )
                          )
                        } catch (e) {
                          toast.error(`Failed to upload ${uf.file.name}`)
                          setUploadedFiles(prev =>
                            prev.map(f =>
                              f.file === uf.file ? { ...f, status: 'error' } : f
                            )
                          )
                        }
                      })
                    )
                  }}
                />
              )}
              <Button
                type="button"
                variant={isRecording ? 'default' : 'outline'}
                size="icon"
                className={cn(
                  'shrink-0 rounded-full',
                  isRecording && 'animate-pulse'
                )}
                title={
                  isRecording
                    ? `Stop recording (${recordingSeconds}s)`
                    : isProcessingAudio
                      ? 'Transcribing audio...'
                      : 'Record audio'
                }
                disabled={isLoading || isProcessingAudio}
                onClick={isRecording ? stopRecording : startRecording}
              >
                {isProcessingAudio ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Mic className="size-4" />
                )}
              </Button>
              <SearchModeSelector />
            </div>
            <div className="flex items-center gap-2">
              {messages.length > 0 && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleNewChat}
                  className="shrink-0 rounded-full group"
                  type="button"
                  disabled={isLoading}
                >
                  <MessageCirclePlus className="size-4 group-hover:rotate-12 transition-all" />
                </Button>
              )}
              {process.env.NEXT_PUBLIC_MORPHIC_CLOUD_DEPLOYMENT !== 'true' && (
                <ModelTypeSelector disabled={isGuest} />
              )}
              <Button
                type={isLoading ? 'button' : 'submit'}
                size={'icon'}
                className={cn(isLoading && 'animate-pulse', 'rounded-full')}
                disabled={input.length === 0 && !isLoading}
                onClick={isLoading ? stop : undefined}
              >
                {isLoading ? <Square size={20} /> : <ArrowUp size={20} />}
              </Button>
            </div>
          </div>
        </div>

        {/* Action buttons for prompt suggestions */}
        {messages.length === 0 && (
          <ActionButtons
            onSelectPrompt={message => {
              // Set the input value and submit
              handleInputChange({
                target: { value: message }
              } as React.ChangeEvent<HTMLTextAreaElement>)
              // Submit the form after a small delay to ensure the input is updated
              setTimeout(() => {
                inputRef.current?.form?.requestSubmit()
                // Reset focus state after action button submission
                setIsInputFocused(false)
                inputRef.current?.blur()
              }, INPUT_UPDATE_DELAY_MS)
            }}
            onCategoryClick={category => {
              // Set the category in the input
              handleInputChange({
                target: { value: category }
              } as React.ChangeEvent<HTMLTextAreaElement>)
              // Focus the input
              inputRef.current?.focus()
            }}
            inputRef={inputRef}
            className="mt-2"
          />
        )}
      </form>
    </div>
  )
}
