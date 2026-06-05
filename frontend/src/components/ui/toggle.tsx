import { cn } from '@/lib/cn'
import type { ButtonHTMLAttributes } from 'react'

export interface ToggleProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked: boolean
  onChange: (checked: boolean) => void
}

export function Toggle({ checked, onChange, disabled, className, ...props }: ToggleProps) {
  return (
    <button {...props} type="button" role="switch" aria-checked={checked} disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-hairline', className,
      )}>
      <span className={cn('pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm transition-transform', checked ? 'translate-x-4' : 'translate-x-0')} />
    </button>
  )
}
