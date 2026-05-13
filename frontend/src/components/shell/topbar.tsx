import type { ReactNode } from 'react'
import { ThemeToggle } from './theme-toggle'

export interface TopbarProps {
  title: string
  actions?: ReactNode
}

export function Topbar({ title, actions }: TopbarProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-hairline px-6">
      <h1 className="text-lg font-semibold text-ink">{title}</h1>
      <div className="flex items-center gap-2">
        {actions}
        <ThemeToggle />
      </div>
    </header>
  )
}
