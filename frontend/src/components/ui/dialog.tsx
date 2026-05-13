import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { X } from 'lucide-react'

export interface DialogProps {
  open: boolean
  onClose: () => void
  title?: string
  className?: string
  children: ReactNode
}

export function Dialog({ open, onClose, title, className, children }: DialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Escape key handler
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Focus trap: auto-focus panel on open
  useEffect(() => {
    if (!open) return
    // Save previous focus
    const prev = document.activeElement as HTMLElement | null
    // Focus first focusable element or the panel itself
    requestAnimationFrame(() => {
      const focusable = panelRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (focusable) focusable.focus()
      else panelRef.current?.focus()
    })
    // Prevent body scroll
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
      prev?.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          'relative w-full max-w-lg rounded-[var(--radius-card)] bg-canvas p-6 shadow-[var(--shadow-3)]',
          'focus:outline-none',
          className,
        )}
      >
        {title && (
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Close dialog"
              className="text-ink-mute hover:text-ink transition-colors rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 p-0.5"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
