import { forwardRef, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(
      'flex min-h-[80px] w-full rounded-[var(--radius-input)] border border-hairline bg-canvas px-3 py-2 text-sm',
      'placeholder:text-ink-mute-2 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary',
      'disabled:cursor-not-allowed disabled:opacity-50', className,
    )} {...props} />
  ),
)
Textarea.displayName = 'Textarea'
