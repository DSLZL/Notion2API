import { Activity, ArrowRight, HeartPulse, List } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/cn'

const linkBaseClass =
  'inline-flex h-9 items-center gap-2 rounded-[var(--radius-btn)] border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1'

export function AdminWelcomeHero() {
  const { t } = useI18n()

  return (
    <section className="rounded-[var(--radius-card)] border border-hairline bg-canvas p-5 shadow-[var(--shadow-1)] sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 rounded-md border border-hairline bg-canvas-soft px-3 py-1.5 text-xs font-medium text-ink-mute">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            <span>{t('dashboard.welcomeBadge')}</span>
          </div>
          <h2 className="text-[28px] font-medium leading-[1.15] tracking-[-0.02em] text-ink sm:text-[34px]">
            {t('dashboard.welcomeTitle')}
          </h2>
          <p className="text-sm leading-6 text-ink-mute">{t('dashboard.welcomeDesc')}</p>
          <p className="text-sm leading-6 text-ink-mute">
            {t('dashboard.welcomeEndpoints')}
            <code className="mx-1 rounded-md border border-hairline bg-canvas-soft px-1.5 py-0.5 font-mono text-xs text-canvas-night">
              /admin
            </code>
            <code className="mx-1 rounded-md border border-hairline bg-canvas-soft px-1.5 py-0.5 font-mono text-xs text-canvas-night">
              /v1/*
            </code>
            <code className="mx-1 rounded-md border border-hairline bg-canvas-soft px-1.5 py-0.5 font-mono text-xs text-canvas-night">
              /healthz
            </code>
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href="#/"
              className={cn(
                linkBaseClass,
                'border-transparent bg-primary text-on-primary hover:bg-primary-deep focus-visible:ring-primary',
              )}
            >
              {t('dashboard.welcomeOpenConsole')}
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
            <a
              href="/v1/models"
              target="_blank"
              rel="noreferrer"
              className={cn(linkBaseClass, 'border-hairline bg-canvas text-ink hover:bg-canvas-soft focus-visible:ring-ink')}
            >
              <List className="h-3.5 w-3.5" />
              {t('dashboard.welcomeModels')}
            </a>
            <a
              href="/healthz"
              target="_blank"
              rel="noreferrer"
              className={cn(linkBaseClass, 'border-hairline bg-canvas text-ink hover:bg-canvas-soft focus-visible:ring-ink')}
            >
              <HeartPulse className="h-3.5 w-3.5" />
              {t('dashboard.welcomeHealth')}
            </a>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-[var(--radius-card)] border border-hairline bg-canvas shadow-[var(--shadow-1)]">
            <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
              <span className="text-xs font-medium text-ink">{t('dashboard.mockRuntimeTitle')}</span>
              <span className="inline-flex items-center gap-1 text-xs text-ink-mute">
                <Activity className="h-3 w-3 text-primary" />
                {t('dashboard.mockRuntimeLive')}
              </span>
            </div>
            <div className="space-y-2 px-3 py-3">
              <div className="h-2.5 w-4/5 rounded bg-canvas-soft" />
              <div className="h-2.5 w-3/5 rounded bg-canvas-soft" />
              <div className="h-2.5 w-2/3 rounded bg-canvas-soft" />
            </div>
          </div>
          <div className="rounded-[var(--radius-card)] border border-canvas-night bg-canvas-night px-3 py-3 shadow-[var(--shadow-1)]">
            <p className="mb-2 text-xs font-medium text-on-dark">{t('dashboard.mockProtocolTitle')}</p>
            <pre className="overflow-x-auto font-mono text-[11px] leading-5 text-ink-faint">
              {`GET /v1/models\n200 OK\nservice: notion2api`}
            </pre>
          </div>
        </div>
      </div>
    </section>
  )
}
