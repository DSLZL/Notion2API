import { useMemo, useState } from 'react'
import { useAccounts, useBatchUpdateAccounts } from '@/lib/hooks/use-accounts'
import { Topbar } from '@/components/shell/topbar'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorState } from '@/components/shared/error-state'
import { ConfirmDangerDialog } from '@/components/shared/confirm-danger-dialog'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { StatusDot } from '@/components/shared/status-dot'
import { formatRelativeTime } from '@/lib/format'
import { useToast } from '@/components/ui/toast'
import { useI18n } from '@/lib/i18n'
import { Search, Users, Plus, Upload, RefreshCw } from 'lucide-react'
import { AccountDetail } from './account-detail'
import { EmailLoginDialog } from './email-login-dialog'
import { ManualImportDialog } from './manual-import-dialog'
import type { AccountItem } from '@/lib/types'

function accountStatusVariant(account: AccountItem): 'success' | 'danger' | 'warning' | 'default' {
  if (account.disabled) return 'default'
  if (account.cooldown_active) return 'warning'
  if (account.status === 'active' || account.status === 'ready') return 'success'
  if (account.status === 'error') return 'danger'
  return 'default'
}

function accountStatusLabel(account: AccountItem, t: (key: string, params?: Record<string, string | number>) => string): string {
  if (account.disabled) return t('accounts.statusDisabled')
  if (account.cooldown_active) return t('accounts.statusCooldown')
  return account.status
}

export function AccountsPage() {
  const { t } = useI18n()
  const accounts = useAccounts()
  const batchUpdate = useBatchUpdateAccounts()
  const { toast } = useToast()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<AccountItem | null>(null)
  const [showEmailLogin, setShowEmailLogin] = useState(false)
  const [showManualImport, setShowManualImport] = useState(false)
  const [selectedEmails, setSelectedEmails] = useState<string[]>([])
  const [pendingBatchAction, setPendingBatchAction] = useState<'disable' | 'enable' | null>(null)

  const filtered = accounts.data?.accounts.filter((a) => {
    const q = search.toLowerCase()
    return (
      a.name.toLowerCase().includes(q) ||
      (a.email?.toLowerCase().includes(q) ?? false) ||
      a.status.toLowerCase().includes(q) ||
      (a.space_name?.toLowerCase().includes(q) ?? false) ||
      (a.user_name?.toLowerCase().includes(q) ?? false)
    )
  }) ?? []
  const selectableEmails = useMemo(
    () => filtered.map((account) => account.email).filter((email): email is string => Boolean(email)),
    [filtered],
  )
  const allSelected = selectableEmails.length > 0 && selectableEmails.every((email) => selectedEmails.includes(email))
  const selectedCount = selectedEmails.length

  const toggleEmail = (email: string, checked: boolean) => {
    setSelectedEmails((prev) => checked ? [...prev, email] : prev.filter((item) => item !== email))
  }

  const toggleAll = (checked: boolean) => {
    setSelectedEmails(checked ? selectableEmails : [])
  }

  const handleBatchConfirm = () => {
    if (!pendingBatchAction || selectedEmails.length === 0) return
    batchUpdate.mutate(
      { emails: selectedEmails, action: pendingBatchAction },
      {
        onSuccess: (result) => {
          setSelectedEmails([])
          setPendingBatchAction(null)
          toast(
            pendingBatchAction === 'disable'
              ? t('accounts.batchUpdatedDisabled', { count: result.updated })
              : t('accounts.batchUpdatedEnabled', { count: result.updated }),
            'success',
          )
        },
        onError: (error) => {
          toast((error as Error).message, 'error')
        },
      },
    )
  }

  if (accounts.isLoading) {
    return (
      <>
        <Topbar title={t('accounts.topbar')} />
        <div className="p-6 space-y-4">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-[400px]" />
        </div>
      </>
    )
  }

  if (accounts.isError) {
    return (
      <>
        <Topbar title={t('accounts.topbar')} />
        <ErrorState message={t('accounts.loadFailed')} onRetry={() => accounts.refetch()} />
      </>
    )
  }

  return (
    <>
      <Topbar title={t('accounts.topbar')} />
      <div className="p-6 space-y-4">
        <PageHeader
          title={t('accounts.pageTitle')}
          description={t('accounts.pageDesc', { count: accounts.data?.total ?? 0 })}
          actions={
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" aria-label={t('accounts.topbar')} onClick={() => accounts.refetch()}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setShowEmailLogin(true)}>
                <Plus className="h-3.5 w-3.5" /> {t('accounts.emailLogin')}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setShowManualImport(true)}>
                <Upload className="h-3.5 w-3.5" /> {t('accounts.manualImport')}
              </Button>
            </div>
          }
        />

        {selectedCount > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-hairline bg-canvas-soft px-4 py-3">
            <span className="text-sm text-ink-mute">{t('accounts.selectedCount', { count: selectedCount })}</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPendingBatchAction('enable')}
              loading={batchUpdate.isPending && pendingBatchAction === 'enable'}
            >
              {t('accounts.enableSelected')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPendingBatchAction('disable')}
              loading={batchUpdate.isPending && pendingBatchAction === 'disable'}
            >
              {t('accounts.disableSelected')}
            </Button>
          </div>
        )}

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute-2" />
          <Input
            placeholder={t('accounts.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Users className="h-10 w-10" />}
            title={search ? t('accounts.emptyFilteredTitle') : t('accounts.emptyTitle')}
            description={search ? t('accounts.emptyFilteredDesc') : t('accounts.emptyDesc')}
          />
        ) : (
          <>
            <div className="grid gap-3 md:hidden">
              {filtered.map((account) => (
                <div
                  key={account.id}
                  role="button"
                  tabIndex={0}
                  className="rounded-[var(--radius-card)] border border-hairline bg-canvas px-4 py-3 text-left transition-colors hover:bg-canvas-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  onClick={() => setSelected(account)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSelected(account)
                    }
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className="pt-1" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={account.email ? selectedEmails.includes(account.email) : false}
                        disabled={!account.email}
                        onChange={(e) => account.email && toggleEmail(account.email, e.target.checked)}
                        aria-label={t('accounts.selectAccountAria', { name: account.email ?? account.name })}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink">
                            {account.user_name || account.name}
                            {account.active && (
                              <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary align-middle" title={t('accounts.activeSessionTitle')} />
                            )}
                          </p>
                          {account.email && <p className="truncate text-xs text-ink-mute">{account.email}</p>}
                        </div>
                        <Badge variant={accountStatusVariant(account)}>
                          {accountStatusLabel(account, t)}
                        </Badge>
                      </div>
                      <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <dt className="text-ink-mute">{t('accounts.colWorkspace')}</dt>
                          <dd className="mt-0.5 truncate text-ink">{account.space_name ?? account.workspace ?? '\u2014'}</dd>
                        </div>
                        <div>
                          <dt className="text-ink-mute">{t('accounts.colPriority')}</dt>
                          <dd className="mt-0.5 tabular-nums text-ink">{account.priority ?? 100}</dd>
                        </div>
                        <div>
                          <dt className="text-ink-mute">{t('accounts.colQuota')}</dt>
                          <dd className="mt-0.5 tabular-nums text-ink">
                            {account.hourly_quota ? `${account.window_request_count ?? 0}/${account.hourly_quota}` : '\u221E'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-ink-mute">{t('accounts.colLastActive')}</dt>
                          <dd className="mt-0.5 text-ink">{formatRelativeTime(account.last_used_at ?? account.last_active)}</dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allSelected}
                        onChange={(e) => toggleAll(e.target.checked)}
                        aria-label={t('accounts.selectAllAria')}
                      />
                    </TableHead>
                    <TableHead>{t('accounts.colAccount')}</TableHead>
                    <TableHead>{t('accounts.colStatus')}</TableHead>
                    <TableHead>{t('accounts.colWorkspace')}</TableHead>
                    <TableHead className="text-right">{t('accounts.colPriority')}</TableHead>
                    <TableHead className="text-right">{t('accounts.colQuota')}</TableHead>
                    <TableHead className="text-right">{t('accounts.colRequests')}</TableHead>
                    <TableHead>{t('accounts.colLastActive')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((account) => (
                    <TableRow
                      key={account.id}
                      className="cursor-pointer"
                      onClick={() => setSelected(account)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={account.email ? selectedEmails.includes(account.email) : false}
                          disabled={!account.email}
                          onChange={(e) => account.email && toggleEmail(account.email, e.target.checked)}
                          aria-label={t('accounts.selectAccountAria', { name: account.email ?? account.name })}
                        />
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-ink">
                            {account.user_name || account.name}
                            {account.active && (
                              <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-primary align-middle" title={t('accounts.activeSessionTitle')} />
                            )}
                          </p>
                          {account.email && (
                            <p className="text-xs text-ink-mute">{account.email}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <StatusDot status={accountStatusVariant(account) === 'success' ? 'active' : accountStatusVariant(account) === 'danger' ? 'error' : accountStatusVariant(account)} />
                          <Badge variant={accountStatusVariant(account)}>
                            {accountStatusLabel(account, t)}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-ink-mute">
                        {account.space_name ?? account.workspace ?? '\u2014'}
                      </TableCell>
                      <TableCell className="text-sm text-right tabular-nums">
                        {account.priority ?? 100}
                      </TableCell>
                      <TableCell className="text-sm text-right tabular-nums">
                        {account.hourly_quota ? (
                          <span className={account.quota_limited ? 'text-warning' : ''}>
                            {account.window_request_count ?? 0}/{account.hourly_quota}
                          </span>
                        ) : (
                          <span className="text-ink-mute">\u221E</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-right tabular-nums">
                        {(account.total_successes ?? 0) + (account.total_failures ?? 0)}
                      </TableCell>
                      <TableCell className="text-sm text-ink-mute">
                        {formatRelativeTime(account.last_used_at ?? account.last_active)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>

      {/* Detail slide-over */}
      <AccountDetail account={selected} onClose={() => setSelected(null)} />

      {/* Dialogs */}
      <EmailLoginDialog open={showEmailLogin} onClose={() => setShowEmailLogin(false)} />
      <ManualImportDialog open={showManualImport} onClose={() => setShowManualImport(false)} />
      <ConfirmDangerDialog
        open={pendingBatchAction !== null}
        onClose={() => setPendingBatchAction(null)}
        onConfirm={handleBatchConfirm}
        title={pendingBatchAction === 'disable' ? t('accounts.batchDisableTitle') : t('accounts.batchEnableTitle')}
        description={t('accounts.batchDesc', {
          action: pendingBatchAction === 'disable' ? t('accounts.batchActionDisable') : t('accounts.batchActionEnable'),
          count: selectedCount,
        })}
        confirmLabel={pendingBatchAction === 'disable' ? t('accounts.batchActionDisable') : t('accounts.batchActionEnable')}
        loading={batchUpdate.isPending}
      />
    </>
  )
}
