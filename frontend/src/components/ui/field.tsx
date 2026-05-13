import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
export interface FieldProps { label: string; error?: string; hint?: string; className?: string; children: ReactNode }
export function Field({ label, error, hint, className, children }: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="block text-sm font-medium text-ink">{label}</label>
      {children}
      {error && <p className="text-xs text-danger">{error}</p>}
      {hint && !error && <p className="text-xs text-ink-mute-2">{hint}</p>}
    </div>
  )
}
