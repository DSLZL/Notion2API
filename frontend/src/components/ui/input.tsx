import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> { error?: boolean }

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => (
    <input ref={ref} className={cn(
      'flex h-9 w-full rounded-[var(--radius-input)] border bg-canvas px-3 text-sm',
      'placeholder:text-ink-mute-2 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary',
      'disabled:cursor-not-allowed disabled:opacity-50 transition-colors',
      error ? 'border-danger' : 'border-hairline', className,
    )} {...props} />
  ),
)
Input.displayName = 'Input'
