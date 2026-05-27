import { useState, useMemo } from 'react'
import { PageHeader } from '@/components/shared/page-header'
import { Section } from '@/components/shared/section'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert } from '@/components/ui/alert'
import { EmptyState } from '@/components/shared/empty-state'
import { StatusDot } from '@/components/shared/status-dot'
import { ConfirmDangerDialog } from '@/components/shared/confirm-danger-dialog'
import {
  useConversations,
  useConversationDetail,
  useDeleteConversation,
  useBatchDeleteConversations,
} from '@/lib/hooks/use-conversations'
import { formatRelativeTime } from '@/lib/format'
import { useI18n } from '@/lib/i18n'
import { MessageSquare, RefreshCw, Trash2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { QUERY_KEYS } from '@/lib/constants'

function statusVariant(s: string): 'success' | 'warning' | 'danger' | 'default' {
  if (s === 'completed') return 'success'
  if (s === 'in_progress') return 'warning'
  if (s === 'failed') return 'danger'
  return 'default'
}

export default function ConversationsPage() {
  const { t } = useI18n()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [originFilter, setOriginFilter] = useState('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBatchDelete, setShowBatchDelete] = useState(false)
  const [showSingleDelete, setShowSingleDelete] = useState(false)

  const qc = useQueryClient()
  const { data: conversations = [], isLoading, isError } = useConversations()
  const { data: detail } = useConversationDetail(selectedId)
  const deleteMutation = useDeleteConversation()
  const batchDeleteMutation = useBatchDeleteConversations()

  const filtered = useMemo(() => {
    let list = conversations
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        (c) =>
          c.title?.toLowerCase().includes(q) ||
          c.id?.toLowerCase().includes(q) ||
          c.account_email?.toLowerCase().includes(q),
      )
    }
    if (statusFilter !== 'all') list = list.filter((c) => c.status === statusFilter)
    if (originFilter !== 'all') list = list.filter((c) => c.origin === originFilter)
    return list
  }, [conversations, search, statusFilter, originFilter])

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleSingleDelete = () => {
    if (!selectedId) return
    deleteMutation.mutate(selectedId, {
      onSuccess: () => {
        setSelectedId(null)
        setShowSingleDelete(false)
      },
    })
  }

  const handleBatchDelete = () => {
    batchDeleteMutation.mutate([...selectedIds], {
      onSuccess: () => {
        setSelectedIds(new Set())
        setShowBatchDelete(false)
        if (selectedId && selectedIds.has(selectedId)) setSelectedId(null)
      },
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('conversations.pageTitle', { suffix: conversations.length ? ` (${conversations.length})` : '' })}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: QUERY_KEYS.CONVERSATIONS })}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Input
          placeholder={t('conversations.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-[240px]"
        />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-[140px]">
          <option value="all">{t('conversations.filterAllStatus')}</option>
          <option value="completed">{t('conversations.filterCompleted')}</option>
          <option value="in_progress">{t('conversations.filterInProgress')}</option>
          <option value="failed">{t('conversations.filterFailed')}</option>
        </Select>
        <Select value={originFilter} onChange={(e) => setOriginFilter(e.target.value)} className="w-[130px]">
          <option value="all">{t('conversations.filterAllOrigin')}</option>
          <option value="local">{t('conversations.filterLocal')}</option>
          <option value="notion">{t('conversations.filterNotion')}</option>
          <option value="merged">{t('conversations.filterMerged')}</option>
        </Select>
      </div>

      {isError && <Alert variant="error">{t('conversations.loadFailed')}</Alert>}

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 min-h-[480px]">
        {/* List */}
        <div className="border border-hairline rounded-[var(--radius-card)] overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto divide-y divide-hairline">
            {isLoading && Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-3 animate-pulse">
                <div className="h-4 bg-hairline-cool rounded w-3/4 mb-2" />
                <div className="h-3 bg-hairline-cool rounded w-1/2" />
              </div>
            ))}
            {!isLoading && filtered.length === 0 && (
              <EmptyState
                icon={<MessageSquare className="h-6 w-6" />}
                title={t('conversations.emptyTitle')}
                description={search ? t('conversations.emptySearchDesc') : t('conversations.emptyDesc')}
              />
            )}
            {filtered.map((c) => (
              <div
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`flex items-start gap-2 p-3 cursor-pointer transition-colors ${
                  selectedId === c.id ? 'bg-canvas-soft' : 'hover:bg-canvas-soft/50'
                }`}
              >
                <Checkbox
                  checked={selectedIds.has(c.id)}
                  onChange={() => toggleSelect(c.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{c.title || c.id}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <StatusDot status={c.status === 'completed' ? 'success' : c.status === 'failed' ? 'error' : 'warning'} />
                    <span className="text-xs text-ink-mute">{c.status}</span>
                    <span className="text-xs text-ink-mute-2">{formatRelativeTime(c.created_at)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {selectedIds.size > 0 && (
            <div className="border-t border-hairline p-3 bg-canvas-soft flex items-center justify-between">
              <span className="text-xs text-ink-mute">{t('conversations.selectedCount', { count: selectedIds.size })}</span>
              <Button variant="danger" size="sm" onClick={() => setShowBatchDelete(true)}>
                <Trash2 className="h-3.5 w-3.5" /> {t('common.delete')}
              </Button>
            </div>
          )}
        </div>

        {/* Detail */}
        <Section>
          {!selectedId && (
            <EmptyState
              icon={<MessageSquare className="h-8 w-8" />}
              title={t('conversations.selectTitle')}
              description={t('conversations.selectDesc')}
            />
          )}

          {selectedId && detail && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-ink">{detail.title || detail.id}</h3>
                <p className="text-xs text-ink-mute font-mono mt-1">{detail.id}</p>
                {detail.account_email && (
                  <p className="text-xs text-ink-mute mt-1">{detail.account_email}</p>
                )}
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant={statusVariant(detail.status)}>{detail.status}</Badge>
                  {detail.origin && <Badge>{detail.origin}</Badge>}
                </div>
              </div>

              {detail.messages && detail.messages.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-ink-mute">{t('conversations.messages')}</h4>
                  {detail.messages.map((msg, i) => (
                    <div key={i} className={`rounded-[var(--radius-card)] p-3 text-sm ${
                      msg.role === 'user' ? 'bg-canvas-soft' : 'bg-primary/5'
                    }`}>
                      <p className="text-xs font-medium text-ink-mute mb-1">
                        {msg.role === 'user' ? t('conversations.roleUser') : t('conversations.roleAssistant')}
                      </p>
                      <p className="whitespace-pre-wrap text-ink">{msg.content}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-2">
                <Button variant="danger" size="sm" onClick={() => setShowSingleDelete(true)}>
                  <Trash2 className="h-3.5 w-3.5" /> {t('conversations.deleteConversation')}
                </Button>
              </div>
            </div>
          )}
        </Section>
      </div>

      {/* Dialogs */}
      <ConfirmDangerDialog
        open={showBatchDelete}
        onClose={() => setShowBatchDelete(false)}
        onConfirm={handleBatchDelete}
        loading={batchDeleteMutation.isPending}
        title={t('conversations.batchDeleteTitle', { count: selectedIds.size })}
        description={t('conversations.deleteConfirmDesc')}
      />
      <ConfirmDangerDialog
        open={showSingleDelete}
        onClose={() => setShowSingleDelete(false)}
        onConfirm={handleSingleDelete}
        loading={deleteMutation.isPending}
        title={t('conversations.singleDeleteTitle')}
        description={t('conversations.deleteConfirmDesc')}
      />
    </div>
  )
}
