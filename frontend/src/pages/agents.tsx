import { useState } from 'react'
import { Bot, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { Topbar } from '@/components/shell/topbar'
import { PageHeader } from '@/components/shared/page-header'
import { Section } from '@/components/shared/section'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorState } from '@/components/shared/error-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'
import { useAgents, useCreateAgent, useDeleteAgent, useUpdateAgentModel } from '@/lib/hooks/use-agents'
import { useI18n } from '@/lib/i18n'

const DEFAULT_MODELS = [
  'apricot-sorbet-high',
  'oval-kumquat-medium',
  'gpt-5.4',
]

export default function AgentsPage() {
  const { t } = useI18n()
  const { toast } = useToast()
  const agents = useAgents()
  const createAgent = useCreateAgent()
  const updateModel = useUpdateAgentModel()
  const deleteAgent = useDeleteAgent()

  const [name, setName] = useState('')
  const [icon, setIcon] = useState('')
  const [modelType, setModelType] = useState(DEFAULT_MODELS[0])
  const [pendingModelByID, setPendingModelByID] = useState<Record<string, string>>({})

  const items = agents.data ?? []

  const handleCreate = () => {
    createAgent.mutate(
      {
        name: name.trim() || undefined,
        icon: icon.trim() || undefined,
        model_type: modelType,
      },
      {
        onSuccess: () => {
          setName('')
          setIcon('')
          toast(t('agents.createSuccess'), 'success')
        },
        onError: (error) => toast((error as Error).message || t('agents.createFailed'), 'error'),
      },
    )
  }

  const handleUpdateModel = (id: string, current: string) => {
    const next = pendingModelByID[id] || current
    updateModel.mutate(
      { id, model_type: next },
      {
        onSuccess: () => toast(t('agents.updateSuccess'), 'success'),
        onError: (error) => toast((error as Error).message || t('agents.updateFailed'), 'error'),
      },
    )
  }

  const handleDelete = (id: string, label: string) => {
    if (!window.confirm(t('agents.deleteConfirm', { name: label }))) {
      return
    }
    deleteAgent.mutate(id, {
      onSuccess: () => toast(t('agents.deleteSuccess'), 'success'),
      onError: (error) => toast((error as Error).message || t('agents.deleteFailed'), 'error'),
    })
  }

  return (
    <>
      <Topbar
        title={t('agents.topbar')}
        actions={(
          <Button variant="secondary" size="sm" onClick={() => agents.refetch()} loading={agents.isFetching}>
            <RefreshCw className="h-4 w-4" />
            {t('agents.refresh')}
          </Button>
        )}
      />
      <div className="space-y-6 p-6">
        <PageHeader
          title={t('agents.pageTitle')}
          description={t('agents.pageDesc')}
        />

        <Section title={t('agents.createSection')}>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
            <Input
              placeholder={t('agents.namePlaceholder')}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <Input
              placeholder={t('agents.iconPlaceholder')}
              value={icon}
              onChange={(event) => setIcon(event.target.value)}
            />
            <Select value={modelType} onChange={(event) => setModelType(event.target.value)}>
              {DEFAULT_MODELS.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </Select>
            <Button onClick={handleCreate} loading={createAgent.isPending}>
              <Plus className="h-4 w-4" />
              {t('agents.create')}
            </Button>
          </div>
        </Section>

        {agents.isLoading && (
          <Section title={t('agents.listSection')}>
            <p className="text-sm text-ink-mute">{t('agents.loading')}</p>
          </Section>
        )}

        {agents.isError && (
          <ErrorState message={t('agents.loadFailed')} onRetry={() => agents.refetch()} />
        )}

        {!agents.isLoading && !agents.isError && (
          <Section title={t('agents.listSection')}>
            {items.length === 0 ? (
              <EmptyState
                icon={<Bot className="h-8 w-8" />}
                title={t('agents.emptyTitle')}
                description={t('agents.emptyDesc')}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('agents.colName')}</TableHead>
                    <TableHead>{t('agents.colID')}</TableHead>
                    <TableHead>{t('agents.colStatus')}</TableHead>
                    <TableHead>{t('agents.colModel')}</TableHead>
                    <TableHead>{t('agents.colActions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((agent) => {
                    const currentModel = agent.model?.type || DEFAULT_MODELS[0]
                    const candidateModel = pendingModelByID[agent.id] || currentModel
                    const displayName = agent.name?.trim() || t('agents.unnamed')
                    return (
                      <TableRow key={agent.id}>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-medium text-ink">{displayName}</p>
                            {agent.icon && (
                              <p className="truncate text-xs text-ink-mute">{agent.icon}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <code className="rounded bg-canvas-soft px-1.5 py-0.5 font-mono text-xs text-ink-mute">{agent.id}</code>
                        </TableCell>
                        <TableCell>
                          <Badge variant={agent.alive ? 'success' : 'default'}>
                            {agent.alive ? t('agents.alive') : t('agents.deleted')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Select
                              value={candidateModel}
                              onChange={(event) =>
                                setPendingModelByID((prev) => ({ ...prev, [agent.id]: event.target.value }))
                              }
                              className="min-w-[220px]"
                            >
                              {DEFAULT_MODELS.map((item) => (
                                <option key={item} value={item}>{item}</option>
                              ))}
                            </Select>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleUpdateModel(agent.id, currentModel)}
                              loading={updateModel.isPending}
                              disabled={!agent.alive}
                            >
                              {t('agents.update')}
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleDelete(agent.id, displayName)}
                            loading={deleteAgent.isPending}
                            disabled={!agent.alive}
                          >
                            <Trash2 className="h-4 w-4" />
                            {t('agents.delete')}
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </Section>
        )}
      </div>
    </>
  )
}
