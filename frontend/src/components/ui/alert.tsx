import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { AlertCircle, AlertTriangle, Info } from 'lucide-react'
const variants = {
  error: { bg: 'bg-danger-bg border-red-200 text-red-800', Icon: AlertCircle },
  warning: { bg: 'bg-warning-bg border-amber-200 text-amber-800', Icon: AlertTriangle },
  info: { bg: 'bg-blue-50 border-blue-200 text-blue-800', Icon: Info },
} as const
export interface AlertProps { variant?: keyof typeof variants; className?: string; children: ReactNode }
export function Alert({ variant = 'info', className, children }: AlertProps) {
  const { bg, Icon } = variants[variant]
  return (
    <div className={cn('flex items-start gap-3 rounded-[var(--radius-card)] border p-4 text-sm', bg, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  )
}
