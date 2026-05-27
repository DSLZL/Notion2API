import { useConfig, useVersion } from '@/lib/hooks/use-config'
import { Topbar } from '@/components/shell/topbar'
import { MetricCard } from '@/components/shared/metric-card'
import { DlSection } from '@/components/shared/dl-section'
import { Section } from '@/components/shared/section'
import { StatusDot } from '@/components/shared/status-dot'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/shared/error-state'
import { formatUptime, formatNumber, formatRelativeTime } from '@/lib/format'
import { useI18n } from '@/lib/i18n'
import { Users, Box, Activity, Clock, Shield, Wifi } from 'lucide-react'

export function DashboardPage() {
  const { t } = useI18n()
  const config = useConfig()
  const version = useVersion()

  if (config.isLoading) {
    return (
      <>
        <Topbar title={t('dashboard.topbar')} />
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[100px]" />
            ))}
          </div>
          <Skeleton className="h-[200px]" />
        </div>
      </>
    )
  }

  if (config.isError) {
    return (
      <>
        <Topbar title={t('dashboard.topbar')} />
        <ErrorState message={t('dashboard.loadFailed')} onRetry={() => config.refetch()} />
      </>
    )
  }

  const c = config.data!
  const v = version.data
  const session = c.session
  const refreshRuntime = c.session_refresh_runtime

  return (
    <>
      <Topbar title={t('dashboard.topbar')} />
      <div className="p-6 space-y-6">
        {/* Runtime Health */}
        <Section title={t('dashboard.runtimeHealth')}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="flex items-center gap-3">
              <StatusDot status={c.health.status} className="h-3 w-3" />
              <div>
                <p className="text-xs text-ink-mute">{t('dashboard.health')}</p>
                <p className="text-sm font-medium text-ink capitalize">{c.health.status}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <StatusDot status={c.session_ready ? 'active' : 'error'} className="h-3 w-3" />
              <div>
                <p className="text-xs text-ink-mute">{t('dashboard.session')}</p>
                <p className="text-sm font-medium text-ink">{c.session_ready ? t('dashboard.ready') : t('dashboard.notReady')}</p>
              </div>
            </div>
            {c.active_account && (
              <div className="flex items-center gap-3">
                <Shield className="h-4 w-4 text-ink-mute" />
                <div>
                  <p className="text-xs text-ink-mute">{t('dashboard.activeAccount')}</p>
                  <p className="text-sm font-medium text-ink truncate max-w-[180px]">{c.active_account}</p>
                </div>
              </div>
            )}
            {refreshRuntime?.last_refresh_at && (
              <div className="flex items-center gap-3">
                <Wifi className="h-4 w-4 text-ink-mute" />
                <div>
                  <p className="text-xs text-ink-mute">{t('dashboard.lastRefresh')}</p>
                  <p className="text-sm font-medium text-ink">{formatRelativeTime(refreshRuntime.last_refresh_at)}</p>
                </div>
              </div>
            )}
          </div>
          {refreshRuntime?.last_error && (
            <p className="text-xs text-danger mt-2">{t('dashboard.lastError', { message: refreshRuntime.last_error })}</p>
          )}
        </Section>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label={t('dashboard.accounts')}
            value={formatNumber(c.notion_accounts_count)}
            icon={<Users className="h-5 w-5" />}
          />
          <MetricCard
            label={t('dashboard.models')}
            value={formatNumber(c.models_count)}
            icon={<Box className="h-5 w-5" />}
          />
          <MetricCard
            label={t('dashboard.activeModels')}
            value={formatNumber(c.active_models_count)}
            icon={<Activity className="h-5 w-5" />}
          />
          <MetricCard
            label={t('dashboard.uptime')}
            value={formatUptime(c.uptime_seconds)}
            icon={<Clock className="h-5 w-5" />}
          />
        </div>

        {/* Session Info */}
        {session && (
          <DlSection
            title={t('dashboard.sessionInfo')}
            items={[
              { label: t('dashboard.user'), value: session.user_name || session.user_email || '\u2014' },
              { label: t('dashboard.email'), value: session.user_email || '\u2014' },
              { label: t('dashboard.space'), value: session.space_name || '\u2014' },
              { label: t('dashboard.clientVersion'), value: session.client_version || '\u2014' },
              { label: t('dashboard.cookieCount'), value: String(session.cookie_count ?? '\u2014') },
            ]}
          />
        )}

        {/* Service Info */}
        <DlSection
          title={t('dashboard.serviceInfo')}
          items={[
            { label: t('dashboard.version'), value: v?.version ?? c.version },
            { label: t('dashboard.commit'), value: v?.commit ?? '\u2014' },
            { label: t('dashboard.buildTime'), value: v?.build_time ?? '\u2014' },
            { label: t('dashboard.notionApi'), value: c.health.notion_api ? t('dashboard.connected') : t('dashboard.disconnected') },
            { label: t('dashboard.database'), value: c.health.database ? t('dashboard.connected') : t('dashboard.disconnected') },
          ]}
        />

        {/* Feature Flags */}
        <Section title={t('dashboard.featureFlags')}>
          <div className="flex flex-wrap gap-2">
            {Object.entries(c.features).map(([key, enabled]) => (
              <Badge key={key} variant={enabled ? 'success' : 'default'}>
                {key}: {enabled ? t('dashboard.flagOn') : t('dashboard.flagOff')}
              </Badge>
            ))}
            {Object.keys(c.features).length === 0 && (
              <span className="text-sm text-ink-mute">{t('dashboard.noFeatureFlags')}</span>
            )}
          </div>
        </Section>
      </div>
    </>
  )
}
