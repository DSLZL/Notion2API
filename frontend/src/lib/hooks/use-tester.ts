import { useMutation } from '@tanstack/react-query'
import { api } from '../api'

export interface TestRequest {
  prompt: string
  model: string
  web_search: boolean
  email: string
  dispatch_mode: string
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
  result?: Record<string, unknown>
  error?: string
}

export function useRunTest() {
  return useMutation({
    mutationFn: (req: TestRequest) =>
      api.post<TestResponse>('/admin/test', req),
  })
}
