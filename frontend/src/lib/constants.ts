export const ROUTES = {
  LOGIN: '/login',
  DASHBOARD: '/',
  ACCOUNTS: '/accounts',
  ACCOUNT_DETAIL: '/accounts/:id',
  MODELS: '/models',
  AGENTS: '/agents',
  TESTER: '/tester',
  CONVERSATIONS: '/conversations',
  SETTINGS: '/settings',
} as const

export const QUERY_KEYS = {
  VERIFY: ['verify'] as const,
  CONFIG: ['config'] as const,
  VERSION: ['version'] as const,
  ACCOUNTS: ['accounts'] as const,
  MODELS: ['models'] as const,
  CONVERSATIONS: ['conversations'] as const,
  AGENTS: ['agents'] as const,
  SETTINGS: ['settings'] as const,
} as const

export const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  inactive: 'Inactive',
  error: 'Error',
  disabled: 'Disabled',
  ok: 'OK',
  warning: 'Warning',
  healthy: 'Healthy',
  unhealthy: 'Unhealthy',
} as const
