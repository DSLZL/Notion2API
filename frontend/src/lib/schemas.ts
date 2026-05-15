import { z } from 'zod'

export const verifySchema = z.object({
  authenticated: z.boolean(),
  needs_setup: z.boolean().optional(),
  message: z.string().optional(),
}).passthrough()

export const loginSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
}).passthrough()

export const healthSchema = z.object({
  status: z.enum(['healthy', 'unhealthy', 'degraded']),
  notion_api: z.boolean(),
  database: z.boolean(),
  message: z.string().optional(),
}).passthrough()

export const sessionInfoSchema = z.object({
  probe_path: z.string().optional(),
  client_version: z.string().optional(),
  user_id: z.string().optional(),
  user_email: z.string().optional(),
  user_name: z.string().optional(),
  space_id: z.string().optional(),
  space_name: z.string().optional(),
  cookie_count: z.number().optional(),
}).passthrough()

export const configSchema = z.object({
  notion_token_set: z.boolean(),
  admin_password_set: z.boolean(),
  notion_accounts_count: z.number(),
  models_count: z.number(),
  active_models_count: z.number(),
  features: z.record(z.boolean()),
  uptime_seconds: z.number(),
  version: z.string(),
  health: healthSchema,
  session_ready: z.boolean().optional(),
  active_account: z.string().optional(),
  session: sessionInfoSchema.optional(),
  session_refresh_runtime: z.object({
    last_refresh_at: z.string().optional(),
    last_error: z.string().optional(),
  }).passthrough().optional(),
}).passthrough()

export const versionSchema = z.object({
  version: z.string(),
  commit: z.string().optional(),
  build_time: z.string().optional(),
}).passthrough()

export const accountItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().optional(),
  status: z.string(),
  workspace: z.string().optional(),
  bot_id: z.string().optional(),
  request_count: z.number().optional(),
  last_active: z.string().optional(),
  created_at: z.string().optional(),
  token_preview: z.string().optional(),
  // Extended fields from API
  active: z.boolean().optional(),
  disabled: z.boolean().optional(),
  priority: z.number().optional(),
  hourly_quota: z.number().optional(),
  max_concurrency: z.number().optional(),
  quota_limited: z.boolean().optional(),
  remaining_quota: z.number().optional(),
  cooldown_active: z.boolean().optional(),
  cooldown_remaining_sec: z.number().optional(),
  user_id: z.string().optional(),
  user_name: z.string().optional(),
  space_id: z.string().optional(),
  space_name: z.string().optional(),
  plan_type: z.string().optional(),
  client_version: z.string().optional(),
  sticky_proxy_account: z.string().optional(),
  last_error: z.string().optional(),
  consecutive_failures: z.number().optional(),
  total_successes: z.number().optional(),
  total_failures: z.number().optional(),
  last_used_at: z.string().optional(),
  last_success_at: z.string().optional(),
  last_refresh_at: z.string().optional(),
  last_login_at: z.string().optional(),
  window_request_count: z.number().optional(),
}).passthrough()

export const accountsSchema = z.object({
  accounts: z.array(accountItemSchema),
  total: z.number(),
}).passthrough()

export const modelEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  model_id: z.string(),
  provider: z.string().optional(),
  enabled: z.boolean(),
  aliases: z.array(z.string()).optional(),
  description: z.string().optional(),
  capabilities: z.array(z.string()).optional(),
  request_count: z.number().optional(),
}).passthrough()

export const modelsSchema = z.object({
  models: z.array(modelEntrySchema),
  aliases: z.record(z.string()).optional(),
  total: z.number(),
}).passthrough()
