import { cn } from '@/lib/cn'
export interface CodeBlockProps { children: string; className?: string }
export function CodeBlock({ children, className }: CodeBlockProps) {
  return <pre className={cn('overflow-auto rounded-[var(--radius-input)] bg-canvas-night p-4 text-sm text-on-dark font-mono', className)}><code>{children}</code></pre>
}
