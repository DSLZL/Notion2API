import { useState, useEffect } from 'react'
import { X, Play, Zap, Trash2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/cn'
import { DlSection } from '@/components/shared/dl-section'
import { Section } from '@/components/shared/section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Toggle } from '@/components/ui/toggle'
import { Alert } from '@/components/ui/alert'
import { StatusDot } from '@/components/shared/status-dot'
import { ConfirmDangerDialog } from '@/components/shared/confirm-danger-dialog'
import { formatRelativeTime } from '@/lib/format'
import { useToast } from '@/components/ui/toast'
import { useI18n } from '@/lib/i18n'
import {
  useActivateAccount,
  useTestAccount,
  useDeleteAccount,
  useEditAccount,
  useRotateStickyAccount,
} from '@/lib/hooks/use-accounts'
import type { AccountItem } from '@/lib/types'

export interface AccountDetailProps {
  account: AccountItem | null
  onClose: () => void
}

export function AccountDetail({ account, onClose }: AccountDetailProps) {
  const { t } = useI18n()
  const { toast } = useToast()
  const [showDelete, setShowDelete] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editFields, setEditFields] = useState({
    disabled: false,
    priority: 100,
    hourly_quota: 0,
    max_concurrency: 3,
  })

  const activateMutation = useActivateAccount()
  const testMutation = useTestAccount()
  const deleteMutation = useDeleteAccount()
  const editMutation = useEditAccount()
  const rotateStickyMutation = useRotateStickyAccount()

  // Reset state when account changes
  useEffect(() => {
    setTestResult(null)
    setEditMode(false)
    if (account) {
      setEditFields({
        disabled: account.disabled ?? false,
        priority: account.priority ?? 100,
        hourly_quota: account.hourly_quota ?? 0,
        max_concurrency: account.max_concurrency ?? 3,
      })
    }
  }, [account])

  // Close on Escape
  useEffect(() => {
    if (!account) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [account, onClose])

  const handleActivate = () => {
    if (!account?.email) return
    activateMutation.mutate(account.email, {
      onSuccess: () => toast(t('accountDetail.activated'), 'success'),
      onError: (e) => toast((e as Error).message, 'error'),
    })
  }

  const handleTest = () => {
    if (!account?.email) return
    setTestResult(null)
    testMutation.mutate(account.email, {
      onSuccess: (res) => {
        setTestResult(res.success ? (res.text || t('accountDetail.testPassed')) : (res.error || t('accountDetail.testFailed')))
      },
      onError: (e) => setTestResult((e as Error).message),
    })
  }

  const handleDelete = () => {
    if (!account?.email) return
    deleteMutation.mutate(account.email, {
      onSuccess: () => {
        setShowDelete(false)
        onClose()
        toast(t('accountDetail.deleted'), 'success')
      },
      onError: (e) => toast((e as Error).message, 'error'),
    })
  }

  const handleEditSave = () => {
    if (!account?.email) return
    editMutation.mutate(
      { email: account.email, ...editFields },
      {
        onSuccess: () => {
          setEditMode(false)
          toast(t('accountDetail.updated'), 'success')
        },
        onError: (e) => toast((e as Error).message, 'error'),
      },
    )
  }

  const handleRotateSticky = () => {
    if (!account?.email) return
    rotateStickyMutation.mutate(account.email, {
      onSuccess: (res) => {
        const rotatedTo = res.sticky_proxy_account || 'updated'
        toast(t('accountDetail.stickyRotated', { target: rotatedTo }), 'success')
      },
      onError: (e) => toast((e as Error).message, 'error'),
    })
  }

  return (
    <>
      {/* Backdrop */}
      {account && (
        <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      )}

      {/* Slide-over panel */}
      <div
        className={cn(
          'fixed right-0 top-0 z-50 h-full w-full max-w-md bg-canvas border-l border-hairline shadow-[var(--shadow-3)] transition-transform duration-200',
          account ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {account && (
          <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-ink">
                  {account.user_name || account.name || account.email}
                </h2>
                {account.email && (
                  <p className="text-sm text-ink-mute">{account.email}</p>
                )}
              </div>
              <button onClick={onClose} className="text-ink-mute hover:text-ink transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Status */}
              <div className="flex items-center gap-2 flex-wrap">
                <StatusDot status={account.status === 'ready' || account.status === 'active' ? 'active' : account.status === 'error' ? 'error' : 'warning'} />
                <Badge
                  variant={
                    account.status === 'ready' || account.status === 'active' ? 'success' :
                    account.status === 'error' ? 'danger' : 'default'
                  }
                >
                  {account.status}
                </Badge>
                {account.active && <Badge variant="success">{t('accountDetail.badgeActive')}</Badge>}
                {account.disabled && <Badge variant="danger">{t('accountDetail.badgeDisabled')}</Badge>}
                {account.plan_type && <Badge>{account.plan_type}</Badge>}
                {account.cooldown_active && <Badge variant="warning">{t('accountDetail.badgeCooldown')}</Badge>}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={handleActivate} loading={activateMutation.isPending}>
                  <Zap className="h-3.5 w-3.5" /> {t('accountDetail.actionActivate')}
                </Button>
                <Button variant="secondary" size="sm" onClick={handleTest} loading={testMutation.isPending}>
                  <Play className="h-3.5 w-3.5" /> {t('accountDetail.actionTest')}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleRotateSticky}
                  loading={rotateStickyMutation.isPending}
                  disabled={!account.email}
                >
                  <RefreshCw className="h-3.5 w-3.5" /> {t('accountDetail.actionRotateSticky')}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setEditMode(!editMode)}>
                  {editMode ? t('accountDetail.actionCancelEdit') : t('accountDetail.actionEdit')}
                </Button>
                <Button variant="danger" size="sm" onClick={() => setShowDelete(true)}>
                  <Trash2 className="h-3.5 w-3.5" /> {t('accountDetail.actionDelete')}
                </Button>
              </div>

              {/* Test result */}
              {testResult && (
                <Alert variant={testMutation.data?.success ? 'info' : 'error'}>
                  {testResult}
                </Alert>
              )}

              {/* Edit fields */}
              {editMode && (
                <Section title={t('accountDetail.editSection')}>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-ink">{t('accountDetail.editDisabled')}</span>
                      <Toggle
                        checked={editFields.disabled}
                        onChange={(v) => setEditFields((p) => ({ ...p, disabled: v }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-ink">{t('accountDetail.editPriority')}</label>
                      <Input
                        type="number"
                        value={editFields.priority}
                        onChange={(e) => setEditFields((p) => ({ ...p, priority: Number(e.target.value) }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-ink">{t('accountDetail.editHourlyQuota')}</label>
                      <Input
                        type="number"
                        value={editFields.hourly_quota}
                        onChange={(e) => setEditFields((p) => ({ ...p, hourly_quota: Number(e.target.value) }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-ink">{t('accountDetail.editMaxConcurrency')}</label>
                      <Input
                        type="number"
                        value={editFields.max_concurrency}
                        onChange={(e) => setEditFields((p) => ({ ...p, max_concurrency: Number(e.target.value) }))}
                      />
                    </div>
                    <Button onClick={handleEditSave} loading={editMutation.isPending}>
                      {t('accountDetail.saveChanges')}
                    </Button>
                  </div>
                </Section>
              )}

              {/* Account Details */}
              <DlSection
                title={t('accountDetail.infoSection')}
                items={[
                  { label: t('accountDetail.infoEmail'), value: account.email ?? '\u2014' },
                  { label: t('accountDetail.infoWorkspace'), value: account.space_name ?? account.workspace ?? '\u2014' },
                  { label: t('accountDetail.infoUserId'), value: account.user_id ?? '\u2014' },
                  { label: t('accountDetail.infoSpaceId'), value: account.space_id ?? '\u2014' },
                  { label: t('accountDetail.infoPlan'), value: account.plan_type ?? '\u2014' },
                  { label: t('accountDetail.infoClientVersion'), value: account.client_version ?? '\u2014' },
                  { label: t('accountDetail.infoStickyProxyAccount'), value: account.sticky_proxy_account ?? '\u2014' },
                ]}
              />

              {/* Usage Stats */}
              <DlSection
                title={t('accountDetail.usageSection')}
                items={[
                  { label: t('accountDetail.usagePriority'), value: String(account.priority ?? 100) },
                  { label: t('accountDetail.usageHourlyQuota'), value: account.hourly_quota ? String(account.hourly_quota) : t('accountDetail.usageUnlimited') },
                  { label: t('accountDetail.usageMaxConcurrency'), value: String(account.max_concurrency ?? '\u2014') },
                  { label: t('accountDetail.usageWindowRequests'), value: String(account.window_request_count ?? 0) },
                  { label: t('accountDetail.usageTotalSuccesses'), value: String(account.total_successes ?? 0) },
                  { label: t('accountDetail.usageTotalFailures'), value: String(account.total_failures ?? 0) },
                  { label: t('accountDetail.usageConsecutiveFailures'), value: String(account.consecutive_failures ?? 0) },
                ]}
              />

              {/* Timestamps */}
              <DlSection
                title={t('accountDetail.timestampsSection')}
                items={[
                  { label: t('accountDetail.timeLastUsed'), value: formatRelativeTime(account.last_used_at ?? account.last_active) },
                  { label: t('accountDetail.timeLastSuccess'), value: formatRelativeTime(account.last_success_at) },
                  { label: t('accountDetail.timeLastRefresh'), value: formatRelativeTime(account.last_refresh_at) },
                  { label: t('accountDetail.timeLastLogin'), value: formatRelativeTime(account.last_login_at) },
                  { label: t('accountDetail.timeCreated'), value: formatRelativeTime(account.created_at) },
                ]}
              />

              {/* Last Error */}
              {account.last_error && (
                <Section title={t('accountDetail.lastErrorSection')}>
                  <p className="text-sm text-danger font-mono break-all">{account.last_error}</p>
                </Section>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      <ConfirmDangerDialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        loading={deleteMutation.isPending}
        title={t('accountDetail.deleteTitle')}
        description={t('accountDetail.deleteDesc', { name: account?.email ?? t('accounts.colAccount') })}
      />
    </>
  )
}
