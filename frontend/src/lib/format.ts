import { formatDistanceToNow, parseISO } from 'date-fns'

export function formatRelativeTime(dateStr: string | undefined | null): string {
  if (!dateStr) return '—'
  try {
    return formatDistanceToNow(parseISO(dateStr), { addSuffix: true })
  } catch {
    return dateStr
  }
}

export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function formatQuota(used: number, total: number): string {
  if (total <= 0) return `${used}`
  return `${used} / ${total}`
}

export function formatNumber(n: number | undefined | null): string {
  if (n == null) return '0'
  return n.toLocaleString()
}
