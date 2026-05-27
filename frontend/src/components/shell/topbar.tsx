import type { ReactNode } from 'react'
import { ThemeToggle } from './theme-toggle'
import { useI18n } from '@/lib/i18n'

export interface TopbarProps {
  title: string
  actions?: ReactNode
}

export function Topbar({ title, actions }: TopbarProps) {
  const { locale, setLocale, t } = useI18n()
  return (
    <header className="flex h-14 items-center justify-between border-b border-hairline px-6">
      <h1 className="text-lg font-semibold text-ink">{title}</h1>
      <div className="flex items-center gap-2">
        {actions}
        <select
          value={locale}
          onChange={(event) => setLocale(event.target.value as 'zh-CN' | 'en-US')}
          className="h-8 rounded-md border border-hairline bg-canvas px-2 text-xs text-ink"
          aria-label="language-switcher"
        >
          <option value="zh-CN">{t('lang.zh')}</option>
          <option value="en-US">{t('lang.en')}</option>
        </select>
        <ThemeToggle />
      </div>
    </header>
  )
}
