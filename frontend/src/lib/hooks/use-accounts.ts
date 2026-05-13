import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { accountsSchema } from '../schemas'
import { QUERY_KEYS } from '../constants'
import type { AccountsResponse } from '../types'

interface AdminAccountItem {
  email?: string
  user_id?: string
  user_name?: string
  space_id?: string
  status?: string
  [key: string]: unknown
}

interface AdminAccountsPayload {
  items?: AdminAccountItem[]
  active_account?: string
  session_ready?: boolean
}

export function useAccounts() {
  return useQuery({
    queryKey: QUERY_KEYS.ACCOUNTS,
    queryFn: async () => {
      const raw = await api.get<AdminAccountsPayload>('/admin/accounts')
      const items = Array.isArray(raw.items) ? raw.items : []
      const normalized = {
        accounts: items.map((account, index) => ({
          id: account.email || account.user_id || account.space_id || `account-${index}`,
          name: account.user_name || account.email || account.user_id || `Account ${index + 1}`,
          status: account.status || 'unknown',
          ...account,
        })),
        total: items.length,
        items,
        active_account: raw.active_account,
        session_ready: raw.session_ready,
      }
      return accountsSchema.parse(normalized) as AccountsResponse
    },
    staleTime: 15_000,
  })
}

export function useActivateAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (email: string) =>
      api.post('/admin/accounts/activate', { email }),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.ACCOUNTS }),
  })
}

export function useTestAccount() {
  return useMutation({
    mutationFn: (email: string) =>
      api.post<{ success: boolean; text?: string; error?: string }>('/admin/accounts/test', { email }),
  })
}

export function useDeleteAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (email: string) =>
      api.delete(`/admin/accounts/${encodeURIComponent(email)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.ACCOUNTS }),
  })
}

export function useEditAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      email: string
      disabled?: boolean
      priority?: number
      hourly_quota?: number
      max_concurrency?: number
    }) => api.put('/admin/accounts', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.ACCOUNTS }),
  })
}

export function useBatchUpdateAccounts() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { emails: string[]; action: 'disable' | 'enable' }) =>
      api.post<{ success: boolean; updated: number; action: string; emails: string[] }>('/admin/accounts/batch-update', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.ACCOUNTS }),
  })
}

export function useStartEmailLogin() {
  return useMutation({
    mutationFn: (email: string) =>
      api.post<{ success: boolean; message?: string }>('/admin/accounts/login/start', { email }),
  })
}

export function useVerifyEmailLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { email: string; code: string }) =>
      api.post<{ success: boolean; message?: string }>('/admin/accounts/login/verify', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.ACCOUNTS }),
  })
}

export function useManualImport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { cookie_header?: string; probe_json_text?: string }) =>
      api.post<{ success: boolean; message?: string }>('/admin/accounts/manual', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.ACCOUNTS }),
  })
}
