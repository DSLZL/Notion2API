import { useModels } from '@/lib/hooks/use-models'
import { Topbar } from '@/components/shell/topbar'
import { PageHeader } from '@/components/shared/page-header'
import { Section } from '@/components/shared/section'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorState } from '@/components/shared/error-state'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Box } from 'lucide-react'

export function ModelsPage() {
  const models = useModels()

  if (models.isLoading) {
    return (
      <>
        <Topbar title="Models" />
        <div className="p-6 space-y-4">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-[400px]" />
        </div>
      </>
    )
  }

  if (models.isError) {
    return (
      <>
        <Topbar title="Models" />
        <ErrorState message="Failed to load models" onRetry={() => models.refetch()} />
      </>
    )
  }

  const { models: list, aliases, total } = models.data!

  return (
    <>
      <Topbar title="Models" />
      <div className="p-6 space-y-6">
        <PageHeader
          title="Available Models"
          description={`${total} models configured`}
        />

        {/* Models Table */}
        {list.length === 0 ? (
          <EmptyState
            icon={<Box className="h-10 w-10" />}
            title="No models configured"
            description="Add models in the settings to get started"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Model ID</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Aliases</TableHead>
                <TableHead>Requests</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((model) => (
                <TableRow key={model.id}>
                  <TableCell>
                    <p className="font-medium text-ink">{model.name}</p>
                    {model.description && (
                      <p className="text-xs text-ink-mute mt-0.5">{model.description}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <code className="text-xs font-mono text-ink-mute bg-canvas-soft px-1.5 py-0.5 rounded">
                      {model.model_id}
                    </code>
                  </TableCell>
                  <TableCell className="text-sm text-ink-mute">
                    {model.provider ?? '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={model.enabled ? 'success' : 'default'}>
                      {model.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {model.aliases?.map((alias) => (
                        <Badge key={alias} variant="default">{alias}</Badge>
                      ))}
                      {(!model.aliases || model.aliases.length === 0) && (
                        <span className="text-xs text-ink-mute">—</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {model.request_count ?? 0}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Aliases section */}
        {aliases && Object.keys(aliases).length > 0 && (
          <Section title="Model Aliases">
            <div className="rounded-[var(--radius-card)] border border-hairline bg-canvas">
              <div className="divide-y divide-hairline">
                {Object.entries(aliases).map(([alias, target]) => (
                  <div key={alias} className="flex items-center justify-between px-5 py-3">
                    <code className="text-sm font-mono text-ink">{alias}</code>
                    <span className="text-sm text-ink-mute">→ {target}</span>
                  </div>
                ))}
              </div>
            </div>
          </Section>
        )}
      </div>
    </>
  )
}
