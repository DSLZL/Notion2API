import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { QUERY_KEYS } from '../constants'
import type { AgentEntry, AgentsResponse } from '../types'

interface AgentCreatePayload {
  name?: string
  icon?: string
  model_type?: string
}

interface AgentModelPatchPayload {
  model_type: string
}

export function useAgents() {
  return useQuery({
    queryKey: QUERY_KEYS.AGENTS,
    queryFn: async () => {
      const raw = await api.get<AgentsResponse>('/admin/agents')
      return raw.items ?? []
    },
    staleTime: 10_000,
  })
}

export function useCreateAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: AgentCreatePayload) => api.post<{ success: boolean; item?: AgentEntry }>('/admin/agents', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.AGENTS }),
  })
}

export function useUpdateAgentModel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, model_type }: { id: string; model_type: string }) =>
      api.patch<{ success: boolean; item?: AgentEntry }>(`/admin/agents/${id}/model`, { model_type } as AgentModelPatchPayload),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.AGENTS }),
  })
}

export function useDeleteAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete<{ success: boolean; message?: string }>(`/admin/agents/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.AGENTS }),
  })
}

