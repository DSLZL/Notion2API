import { cn } from '@/lib/cn'
import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react'
export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return <div className="w-full overflow-auto"><table className={cn('w-full caption-bottom text-sm', className)} {...props} /></div>
}
export function TableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('[&_tr]:border-b [&_tr]:border-hairline', className)} {...props} />
}
export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />
}
export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('border-b border-hairline transition-colors hover:bg-canvas-soft', className)} {...props} />
}
export function TableHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn('h-10 px-4 text-left align-middle text-xs font-medium text-ink-mute', className)} {...props} />
}
export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-4 py-3 align-middle', className)} {...props} />
}
