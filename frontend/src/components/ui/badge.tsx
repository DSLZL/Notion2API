import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
const variants = {
  default: 'bg-canvas-soft text-ink-mute border-hairline-cool',
  success: 'bg-success-bg text-green-700 border-green-200',
  danger: 'bg-danger-bg text-red-700 border-red-200',
  warning: 'bg-warning-bg text-amber-700 border-amber-200',
} as const
export interface BadgeProps { variant?: keyof typeof variants; className?: string; children: ReactNode }
export function Badge({ variant = 'default', className, children }: BadgeProps) {
  return <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium', variants[variant], className)}>{children}</span>
}
