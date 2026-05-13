import { cn } from '@/lib/cn'

export interface StatusDotProps {
  status: 'healthy' | 'unhealthy' | 'degraded' | 'active' | 'inactive' | 'error' | string
  className?: string
}

const colorMap: Record<string, string> = {
  healthy: 'bg-success',
  active: 'bg-success',
  degraded: 'bg-warning',
  unhealthy: 'bg-danger',
  inactive: 'bg-ink-mute-2',
  error: 'bg-danger',
}

export function StatusDot({ status, className }: StatusDotProps) {
  return (
    <span
      className={cn(
        'inline-block h-2 w-2 rounded-full',
        colorMap[status] ?? 'bg-ink-mute-2',
        className,
      )}
    />
  )
}
