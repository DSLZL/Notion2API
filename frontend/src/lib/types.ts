// ---- Auth ----
export interface VerifyResponse {
  authenticated: boolean
  needs_setup?: boolean
  message?: string
  admin_enabled?: boolean
  password_configured?: boolean
  password_required?: boolean
}

export interface LoginResponse {
  success: boolean
  message?: string
}

// ---- Config / Version ----
export interface ConfigResponse {
  notion_token_set: boolean
  admin_password_set: boolean
  notion_accounts_count: number
  models_count: number
  active_models_count: number
  features: Record<string, boolean>
  uptime_seconds: number
  session_ready?: boolean
  version: string
  health: HealthStatus
  active_account?: string
  session?: SessionInfo
  session_refresh_runtime?: {
    last_refresh_at?: string
    last_error?: string
  }
}

export interface SessionInfo {
  probe_path?: string
  client_version?: string
  user_id?: string
  user_email?: string
  user_name?: string
  space_id?: string
  space_name?: string
  cookie_count?: number
}

export interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded'
  notion_api: boolean
  database: boolean
  message?: string
}

export interface VersionResponse {
  version: string
  commit?: string
  build_time?: string
}

// ---- Accounts ----
export interface AccountItem {
  id: string
  name: string
  email?: string
  status: string
  workspace?: string
  bot_id?: string
  request_count?: number
  last_active?: string
  created_at?: string
  token_preview?: string
  // Fields from PLAN.md actual API response
  active?: boolean
  disabled?: boolean
  priority?: number
  hourly_quota?: number
  max_concurrency?: number
  quota_limited?: boolean
  remaining_quota?: number
  cooldown_active?: boolean
  cooldown_remaining_sec?: number
  user_id?: string
  user_name?: string
  space_id?: string
  space_name?: string
  plan_type?: string
  client_version?: string
  sticky_proxy_account?: string
  last_error?: string
  consecutive_failures?: number
  total_successes?: number
  total_failures?: number
  last_used_at?: string
  last_success_at?: string
  last_refresh_at?: string
  last_login_at?: string
  window_request_count?: number
}

export interface AccountsResponse {
  accounts: AccountItem[]
  total: number
  // API also returns these at top level
  items?: AccountItem[]
  active_account?: string
  session_ready?: boolean
}

// ---- Models ----
export interface ModelEntry {
  id: string
  name: string
  model_id: string
  provider?: string
  enabled: boolean
  aliases?: string[]
  description?: string
  capabilities?: string[]
  request_count?: number
}

export interface ModelsResponse {
  models: ModelEntry[]
  aliases?: Record<string, string>
  total: number
}

// ---- Conversations ----
export interface ConversationEntry {
  id: string
  model: string
  account_id?: string
  created_at: string
  updated_at?: string
  message_count: number
  title?: string
  status?: string
  origin?: string
  account_email?: string
  created_by_display?: string
}

export interface ConversationsResponse {
  conversations: ConversationEntry[]
  total: number
}

// ---- Agents ----
export interface AgentModel {
  type?: string
}

export interface AgentEntry {
  id: string
  name?: string
  icon?: string
  alive: boolean
  model?: AgentModel
  thread_id?: string
  activity_score?: string
  last_transcript?: Record<string, unknown>
}

export interface AgentsResponse {
  success: boolean
  items?: AgentEntry[]
}

// ---- Settings ----
export interface SettingsResponse {
  [key: string]: unknown
}

// ---- Generic ----
export interface ApiErrorResponse {
  error: string
  message?: string
  code?: string
}
