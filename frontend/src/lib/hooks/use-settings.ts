import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { API_BASE } from '../env'
import { QUERY_KEYS } from '../constants'

export interface SettingsResponse {
  success: boolean
  config: Record<string, unknown>
  secrets: {
    api_key_set: boolean
    admin_password_set: boolean
    resin_proxy_token_set: boolean
  }
  runtime: {
    timeout_sec: number
    poll_interval_sec: number
    poll_max_rounds: number
    stream_chunk_runes?: number
  }
  features: Record<string, boolean | string | string[]>
  session_refresh: {
    enabled: boolean
    interval_sec: number
    startup_check: boolean
    retry_on_auth_error: boolean
    auto_switch_account: boolean
  }
  default_model: string
  model_aliases?: Record<string, string>
  models: Array<{ id: string; name: string; model_id: string; enabled: boolean }>
  session_ready: boolean
  active_account?: string
}

export interface SnapshotEntry {
  name: string
  size?: number
  modified?: string
}

export function useSettings() {
  return useQuery({
    queryKey: QUERY_KEYS.SETTINGS,
    queryFn: () => api.get<SettingsResponse>('/admin/settings'),
    staleTime: 15_000,
  })
}

export function useSaveSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      api.put<{ success: boolean }>('/admin/settings', patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.SETTINGS }),
  })
}

export function useSnapshots() {
  return useQuery({
    queryKey: ['snapshots'],
    queryFn: () => api.get<{ snapshots?: SnapshotEntry[]; items?: SnapshotEntry[] }>('/admin/config/snapshot'),
    staleTime: 30_000,
  })
}

export function useCreateSnapshot() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/admin/config/snapshot'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['snapshots'] }),
  })
}

export function useExportConfig() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/admin/config/export`, {
        credentials: 'same-origin',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `notion2api_config_${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    },
  })
}

export function useImportConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (config: Record<string, unknown>) =>
      api.post('/admin/config/import', config),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.SETTINGS })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.CONFIG })
    },
  })
}

export function useUpdateSecret() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { field: string; value: string | null }) =>
      api.post('/admin/config', {
        [payload.field]: payload.value,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.SETTINGS })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.CONFIG })
    },
  })
}
