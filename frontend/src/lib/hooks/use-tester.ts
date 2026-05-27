import { useMutation } from '@tanstack/react-query'
import { api } from '../api'
import { API_BASE } from '../env'
import { ApiError } from '../errors'

export interface TestRequest {
  prompt: string
  model: string
  web_search: boolean
  email: string
  dispatch_mode: string
  stream?: boolean
  show_thoughts?: boolean
  attachments?: Array<{
    type: 'file'
    filename: string
    mime_type: string
    file_data: string
  }>
}

export interface TestResponse {
  success: boolean
  conversation_id?: string
  text?: string
  reasoning?: string
  result?: Record<string, unknown>
  error?: string
}

export interface TestStreamEvent {
  event: string
  sequence_number?: number
  delta?: string
  text?: string
  reasoning?: string
  conversation_id?: string
  model?: string
  result?: Record<string, unknown>
  detail?: string
}

export function useRunTest() {
  return useMutation({
    mutationFn: (req: TestRequest) =>
      api.post<TestResponse>('/admin/test', req),
  })
}

export interface RunTestStreamOptions {
  signal?: AbortSignal
  onEvent?: (event: TestStreamEvent) => void
}

export async function runTestStream(req: TestRequest, options: RunTestStreamOptions = {}): Promise<TestResponse> {
  const response = await fetch(`${API_BASE}/admin/test`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({ ...req, stream: true }),
    signal: options.signal,
  })

  if (response.status === 401) {
    window.location.hash = '#/login'
    throw new ApiError('未授权，请重新登录', response.status)
  }
  if (!response.ok) {
    let message = response.statusText || '请求失败'
    try {
      const err = await response.json()
      message = err.detail || err.message || err.error || message
    } catch {
      // ignore
    }
    throw new ApiError(message, response.status)
  }

  if (!response.body) {
    throw new Error('浏览器不支持流式读取')
  }

  const decoder = new TextDecoder()
  const reader = response.body.getReader()
  let pending = ''
  let currentEvent = 'message'
  let dataLines: string[] = []
  let finalResponse: TestResponse = { success: true }

  const flushEvent = () => {
    if (dataLines.length === 0) {
      currentEvent = 'message'
      return
    }
    const rawData = dataLines.join('\n')
    dataLines = []
    if (rawData === '[DONE]') {
      currentEvent = 'message'
      return
    }
    try {
      const parsed = JSON.parse(rawData) as TestStreamEvent
      const eventType = currentEvent
      currentEvent = 'message'
      const merged: TestStreamEvent = { ...parsed, event: eventType }
      options.onEvent?.(merged)
      if (eventType === 'admin_test.completed') {
        finalResponse = {
          success: true,
          conversation_id: merged.conversation_id,
          text: merged.text,
          reasoning: merged.reasoning,
          result: merged.result,
        }
      } else if (eventType === 'admin_test.error') {
        throw new Error(merged.detail || 'stream failed')
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }
      throw new Error('stream parse failed')
    }
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done) {
      if (pending.trim() !== '') {
        const tail = pending + '\n'
        pending = ''
        const parts = tail.split(/\r?\n/)
        for (const line of parts) {
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim()
          } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trim())
          } else if (line.trim() === '') {
            flushEvent()
          }
        }
      }
      break
    }
    pending += decoder.decode(value, { stream: true })
    const chunks = pending.split(/\r?\n/)
    pending = chunks.pop() ?? ''
    for (const line of chunks) {
      if (line.startsWith('event:')) {
        currentEvent = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim())
      } else if (line.startsWith(':')) {
        // keepalive comment
      } else if (line.trim() === '') {
        flushEvent()
      }
    }
  }

  return finalResponse
}
