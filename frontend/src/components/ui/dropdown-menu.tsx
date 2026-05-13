import { useState, useRef, useEffect, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
export interface DropdownMenuProps { trigger: ReactNode; children: ReactNode; align?: 'left' | 'right'; className?: string }
export function DropdownMenu({ trigger, children, align = 'left', className }: DropdownMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])
  return (
    <div ref={ref} className="relative inline-block">
      <div onClick={() => setOpen(!open)}>{trigger}</div>
      {open && (
        <div className={cn('absolute z-50 mt-1 min-w-[160px] rounded-[var(--radius-card)] border border-hairline bg-canvas py-1 shadow-[var(--shadow-2)]',
          align === 'right' ? 'right-0' : 'left-0', className)} onClick={() => setOpen(false)}>{children}</div>
      )}
    </div>
  )
}
export interface DropdownItemProps { onClick?: () => void; danger?: boolean; className?: string; children: ReactNode }
export function DropdownItem({ onClick, danger, className, children }: DropdownItemProps) {
  return <button onClick={onClick} className={cn('flex w-full items-center px-3 py-2 text-sm transition-colors hover:bg-canvas-soft', danger ? 'text-danger' : 'text-ink', className)}>{children}</button>
}
