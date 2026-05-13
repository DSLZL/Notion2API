import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface SectionProps {
  title?: string
  description?: string
  className?: string
  children: ReactNode
}

export function Section({ title, description, className, children }: SectionProps) {
  return (
    <section className={cn('space-y-4', className)}>
      {title && (
        <div>
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-ink-mute">{description}</p>}
        </div>
      )}
      {children}
    </section>
  )
}
