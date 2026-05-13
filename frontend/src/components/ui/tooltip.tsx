import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
export interface TooltipProps { content: string; className?: string; children: ReactNode }
export function Tooltip({ content, className, children }: TooltipProps) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative inline-block" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && <div className={cn('absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-canvas-night px-2.5 py-1 text-xs text-on-dark shadow-sm', className)}>{content}</div>}
    </div>
  )
}
