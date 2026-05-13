import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { verifySchema, loginSchema } from '../schemas'
import { QUERY_KEYS } from '../constants'
import type { VerifyResponse, LoginResponse } from '../types'

export function useVerify() {
  return useQuery({
    queryKey: QUERY_KEYS.VERIFY,
    queryFn: async () => {
      const raw = await api.get<unknown>('/admin/verify')
      return verifySchema.parse(raw) as VerifyResponse
    },
    retry: false,
    staleTime: 30_000,
  })
}

export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (password: string) => {
      const raw = await api.post<unknown>('/admin/login', { password })
      return loginSchema.parse(raw) as LoginResponse
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.VERIFY })
    },
  })
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await api.post<unknown>('/admin/logout')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.VERIFY })
    },
  })
}
