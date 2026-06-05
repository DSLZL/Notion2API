import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router'
import { cn } from '@/lib/cn'
import {
  LayoutDashboard,
  Users,
  Box,
  Bot,
  FlaskConical,
  MessageSquare,
  Settings,
  Menu,
  X,
  LogOut,
} from 'lucide-react'
import { useLogout } from '@/lib/hooks/use-auth'
import { useI18n } from '@/lib/i18n'

export function Sidebar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const logout = useLogout()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { t } = useI18n()

  const navItems = [
    { label: t('nav.dashboard'), path: '/', icon: LayoutDashboard },
    { label: t('nav.accounts'), path: '/accounts', icon: Users },
    { label: t('nav.models'), path: '/models', icon: Box },
    { label: t('nav.agents'), path: '/agents', icon: Bot },
    { label: t('nav.tester'), path: '/tester', icon: FlaskConical },
    { label: t('nav.conversations'), path: '/conversations', icon: MessageSquare },
    { label: t('nav.settings'), path: '/settings', icon: Settings },
  ] as const

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
          {t('nav.logout')}
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile hamburger */}
      <button
        aria-label={t('nav.openMenu')}
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
              aria-label={t('nav.closeMenu')}
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
