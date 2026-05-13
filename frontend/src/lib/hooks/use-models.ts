import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { QUERY_KEYS } from '../constants'
import { modelsSchema } from '../schemas'
import type { ModelsResponse } from '../types'

export interface ModelEntry {
  id: string
  name: string
  model_id: string
  provider?: string
  enabled: boolean
  aliases?: string[]
  description?: string
  capabilities?: string[]
}

interface AdminSettingsModelsResponse {
  models: Array<{
    id?: string
    name?: string
    notion_model?: string
    family?: string
    enabled?: boolean
    aliases?: string[]
  }>
  model_aliases?: Record<string, string>
}

export function useModels() {
  return useQuery({
    queryKey: QUERY_KEYS.MODELS,
    queryFn: async () => {
      const raw = await api.get<AdminSettingsModelsResponse>('/admin/settings')
      const models = Array.isArray(raw.models) ? raw.models : []
      return modelsSchema.parse({
        models: models.map((model, index) => ({
          id: model.id || `model-${index}`,
          name: model.name || model.id || `Model ${index + 1}`,
          model_id: model.notion_model || model.id || `model-${index}`,
          provider: model.family,
          enabled: model.enabled !== false,
          aliases: model.aliases,
        })),
        aliases: raw.model_aliases,
        total: models.length,
      }) as ModelsResponse
    },
    staleTime: 30_000,
  })
}
