import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router'
import { cn } from '@/lib/cn'
import {
  LayoutDashboard,
  Users,
  Box,
  FlaskConical,
  MessageSquare,
  Settings,
  Menu,
  X,
  LogOut,
} from 'lucide-react'
import { useLogout } from '@/lib/hooks/use-auth'

const navItems = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { label: 'Accounts', path: '/accounts', icon: Users },
  { label: 'Models', path: '/models', icon: Box },
  { label: 'Tester', path: '/tester', icon: FlaskConical },
  { label: 'Conversations', path: '/conversations', icon: MessageSquare },
  { label: 'Settings', path: '/settings', icon: Settings },
] as const

export function Sidebar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const logout = useLogout()
  const [mobileOpen, setMobileOpen] = useState(false)

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/'
    return pathname.startsWith(path)
  }

  const nav = (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 px-4 border-b border-hairline">
        <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center">
          <span className="text-sm font-bold text-on-primary">N</span>
        </div>
        <span className="text-sm font-semibold text-ink">Notion2API</span>
      </div>

      {/* Nav items */}
      <nav aria-label="Main navigation" className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {navItems.map(({ label, path, icon: Icon }) => (
          <button
            key={path}
            onClick={() => { navigate(path); setMobileOpen(false) }}
            className={cn(
              'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
              isActive(path)
                ? 'bg-canvas-soft text-ink font-medium border-l-2 border-hairline-strong'
                : 'text-ink-mute hover:bg-canvas-soft hover:text-ink',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>

      {/* Logout */}
      <div className="border-t border-hairline px-2 py-3">
        <button
          onClick={() => logout.mutate()}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-ink-mute hover:bg-canvas-soft hover:text-ink transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-3 top-3 z-40 rounded-md border border-hairline bg-canvas p-2 shadow-sm md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <aside className="relative z-50 h-full w-[240px] bg-canvas border-r border-hairline">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 text-ink-mute hover:text-ink"
            >
              <X className="h-5 w-5" />
            </button>
            {nav}
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-[240px] md:shrink-0 md:flex-col border-r border-hairline bg-canvas h-screen sticky top-0">
        {nav}
      </aside>
    </>
  )
}
