import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { configSchema, versionSchema } from '../schemas'
import { QUERY_KEYS } from '../constants'
import type { ConfigResponse, VersionResponse } from '../types'

interface AdminConfigPayload {
  config?: {
    accounts?: unknown[]
    features?: Record<string, unknown>
    version?: string
  }
  secrets?: {
    api_key_set?: boolean
    admin_password_set?: boolean
  }
  models?: Array<{ enabled?: boolean }>
  session_ready?: boolean
  active_account?: string
  session?: ConfigResponse['session']
  session_refresh_runtime?: ConfigResponse['session_refresh_runtime']
}

function booleanRecord(input: Record<string, unknown> | undefined): Record<string, boolean> {
  if (!input) return {}
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => typeof value === 'boolean'),
  ) as Record<string, boolean>
}

export function useConfig() {
  return useQuery({
    queryKey: QUERY_KEYS.CONFIG,
    queryFn: async () => {
      const raw = await api.get<AdminConfigPayload>('/admin/config')
      const models = Array.isArray(raw.models) ? raw.models : []
      const accounts = Array.isArray(raw.config?.accounts) ? raw.config.accounts : []
      const normalized = {
        notion_token_set: raw.secrets?.api_key_set ?? false,
        admin_password_set: raw.secrets?.admin_password_set ?? false,
        notion_accounts_count: accounts.length,
        models_count: models.length,
        active_models_count: models.filter((model) => model?.enabled !== false).length,
        features: booleanRecord(raw.config?.features),
        uptime_seconds: 0,
        version: raw.config?.version ?? 'unknown',
        health: {
          status: raw.session_ready === false ? 'degraded' : 'healthy',
          notion_api: raw.session_ready !== false,
          database: true,
          message: raw.session_refresh_runtime?.last_error,
        },
        session_ready: raw.session_ready,
        active_account: raw.active_account,
        session: raw.session,
        session_refresh_runtime: raw.session_refresh_runtime,
      }
      return configSchema.parse(normalized) as ConfigResponse
    },
    staleTime: 15_000,
  })
}

export function useVersion() {
  return useQuery({
    queryKey: QUERY_KEYS.VERSION,
    queryFn: async () => {
      const raw = await api.get<unknown>('/admin/version')
      return versionSchema.parse(raw) as VersionResponse
    },
    staleTime: 60_000,
  })
}
