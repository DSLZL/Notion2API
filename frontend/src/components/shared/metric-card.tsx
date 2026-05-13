import { cn } from '@/lib/cn'
import type { ReactNode } from 'react'

export interface MetricCardProps {
  label: string
  value: ReactNode
  icon?: ReactNode
  className?: string
}

export function MetricCard({ label, value, icon, className }: MetricCardProps) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-card)] border border-hairline bg-canvas p-5 shadow-[var(--shadow-1)]',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-mute">{label}</p>
        {icon && <span className="text-ink-mute-2">{icon}</span>}
      </div>
      <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
    </div>
  )
}
