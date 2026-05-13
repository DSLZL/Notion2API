import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Inbox } from 'lucide-react'

export interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 text-center', className)}>
      <div className="mb-4 text-ink-mute-2">{icon ?? <Inbox className="h-10 w-10" />}</div>
      <h3 className="text-sm font-medium text-ink">{title}</h3>
      {description && <p className="mt-1 text-sm text-ink-mute">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
