import { forwardRef, type SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn(
      'flex h-9 w-full rounded-[var(--radius-input)] border border-hairline bg-canvas px-3 text-sm',
      'focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary',
      'disabled:cursor-not-allowed disabled:opacity-50', className,
    )} {...props}>{children}</select>
  ),
)
Select.displayName = 'Select'
