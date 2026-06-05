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
  page?: number
  limit?: number
  total?: number
  has_next?: boolean
  remote_error?: string
}

export interface ConversationListParams {
  page?: number
  limit?: number
  status?: string
  origin?: string
  q?: string
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
  remote_error?: string
}

interface ConversationDetailResponse {
  success: boolean
  item?: ConversationDetail
  remote_error?: string
}

export interface ConversationMessage {
  role: string
  content: string
  created_at?: string
}

export function useConversations(params: ConversationListParams = {}) {
  return useQuery({
    queryKey: [...QUERY_KEYS.CONVERSATIONS, params],
    queryFn: async () => {
      const query = new URLSearchParams()
      if (params.page) query.set('page', String(params.page))
      if (params.limit) query.set('limit', String(params.limit))
      if (params.status && params.status !== 'all') query.set('status', params.status)
      if (params.origin && params.origin !== 'all') query.set('origin', params.origin)
      if (params.q) query.set('q', params.q)
      const suffix = query.toString() ? `?${query.toString()}` : ''
      const raw = await api.get<ConversationsResponse>(`/admin/conversations${suffix}`)
      return {
        items: raw.items ?? raw.conversations ?? [],
        page: raw.page ?? params.page ?? 1,
        limit: raw.limit ?? params.limit ?? 20,
        total: raw.total ?? (raw.items ?? raw.conversations ?? []).length,
        has_next: raw.has_next ?? false,
        remote_error: raw.remote_error,
      }
    },
    staleTime: 10_000,
  })
}

export function useConversationDetail(id: string | null) {
  return useQuery({
    queryKey: [...QUERY_KEYS.CONVERSATIONS, id],
    queryFn: async () => {
      const raw = await api.get<ConversationDetailResponse>('/admin/conversations/' + encodeURIComponent(id ?? ''))
      return raw.item ? { ...raw.item, remote_error: raw.remote_error } : raw as unknown as ConversationDetail
    },
    enabled: !!id,
    staleTime: 5_000,
  })
}

export function useDeleteConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete('/admin/conversations/' + encodeURIComponent(id)),
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
