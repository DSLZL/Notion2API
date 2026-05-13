import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface DlItem {
  label: string
  value: ReactNode
}

export interface DlSectionProps {
  title?: string
  items: DlItem[]
  className?: string
}

export function DlSection({ title, items, className }: DlSectionProps) {
  return (
    <div className={cn('rounded-[var(--radius-card)] border border-hairline bg-canvas', className)}>
      {title && (
        <div className="border-b border-hairline px-5 py-3">
          <h3 className="text-sm font-medium text-ink">{title}</h3>
        </div>
      )}
      <dl className="divide-y divide-hairline">
        {items.map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between px-5 py-3">
            <dt className="text-sm text-ink-mute">{label}</dt>
            <dd className="text-sm text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
