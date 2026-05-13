import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'
export const Checkbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} type="checkbox" className={cn(
      'h-4 w-4 rounded border-hairline text-primary focus:ring-primary/40 cursor-pointer', className,
    )} {...props} />
  ),
)
Checkbox.displayName = 'Checkbox'
