import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { QUERY_KEYS } from '../constants'

export interface ConversationSummary {
  id: string
  title: string
  origin: string
  status: string
  account_email?: string
  created_at: string
  updated_at?: string
  created_by_display?: string
}

interface ConversationsResponse {
  success: boolean
  items?: ConversationSummary[]
  conversations?: ConversationSummary[]
}

export interface ConversationDetail {
  id: string
  title: string
  origin: string
  status: string
  account_email?: string
  thread_id?: string
  created_at: string
  updated_at?: string
  messages?: ConversationMessage[]
}

export interface ConversationMessage {
  role: string
  content: string
  created_at?: string
}

export function useConversations() {
  return useQuery({
    queryKey: QUERY_KEYS.CONVERSATIONS,
    queryFn: async () => {
      const raw = await api.get<ConversationsResponse>('/admin/conversations')
      return raw.items ?? raw.conversations ?? []
    },
    staleTime: 10_000,
  })
}

export function useConversationDetail(id: string | null) {
  return useQuery({
    queryKey: [...QUERY_KEYS.CONVERSATIONS, id],
    queryFn: () => api.get<ConversationDetail>('/admin/conversations/' + id),
    enabled: !!id,
    staleTime: 5_000,
  })
}

export function useDeleteConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete('/admin/conversations/' + id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.CONVERSATIONS }),
  })
}

export function useBatchDeleteConversations() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) => api.post('/admin/conversations/batch-delete', { ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.CONVERSATIONS }),
  })
}
