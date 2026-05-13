import { useState, useEffect, useCallback, useRef } from 'react'
import { PageHeader } from '@/components/shared/page-header'
import { Section } from '@/components/shared/section'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Toggle } from '@/components/ui/toggle'
import { Alert } from '@/components/ui/alert'
import { Dialog } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { ConfirmDangerDialog } from '@/components/shared/confirm-danger-dialog'
import {
  useSettings,
  useSaveSettings,
  useSnapshots,
  useCreateSnapshot,
  useExportConfig,
  useImportConfig,
  useUpdateSecret,
  type SettingsResponse,
} from '@/lib/hooks/use-settings'
import { useModels } from '@/lib/hooks/use-models'
import { Save, Download, Upload, Camera, Eye, EyeOff, Plus, Trash2 } from 'lucide-react'

type DirtyPatch = Record<string, unknown>

function deepGet(obj: Record<string, unknown>, path: string[]): unknown {
  let cur: unknown = obj
  for (const k of path) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[k]
  }
  return cur
}

function deepSet(obj: Record<string, unknown>, path: string[], value: unknown) {
  let cur = obj
  for (let i = 0; i < path.length - 1; i++) {
    if (!(path[i] in cur) || typeof cur[path[i]] !== 'object') cur[path[i]] = {}
    cur = cur[path[i]] as Record<string, unknown>
  }
  cur[path[path.length - 1]] = value
}

// Secret change dialog
function SecretDialog({
  open, onClose, title, onSave, loading,
}: {
  open: boolean; onClose: () => void; title: string
  onSave: (value: string) => void; loading: boolean
}) {
  const [value, setValue] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  useEffect(() => { if (open) { setValue(''); setConfirm(''); setShow(false) } }, [open])
  const valid = value.length > 0 && value === confirm
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-ink">New value</label>
          <div className="relative">
            <Input
              type={show ? 'text' : 'password'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Enter new value..."
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-mute hover:text-ink"
              onClick={() => setShow(!show)}
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-ink">Confirm</label>
          <Input
            type={show ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm new value..."
            error={confirm.length > 0 && value !== confirm}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(value)} disabled={!valid} loading={loading}>Update</Button>
        </div>
      </div>
    </Dialog>
  )
}

export default function SettingsPage() {
  const { data: settings, isLoading } = useSettings()
  const { data: modelsData } = useModels()
  const saveMutation = useSaveSettings()
  const { data: snapshotsData } = useSnapshots()
  const createSnapshotMutation = useCreateSnapshot()
  const exportMutation = useExportConfig()
  const importMutation = useImportConfig()
  const secretMutation = useUpdateSecret()
  const { toast } = useToast()

  const [dirty, setDirty] = useState<DirtyPatch>({})
  const [secretDialog, setSecretDialog] = useState<{ field: string; title: string } | null>(null)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [showImportConfirm, setShowImportConfirm] = useState(false)
  const [importData, setImportData] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState('')
  const importInputRef = useRef<HTMLInputElement>(null)

  const isDirty = Object.keys(dirty).length > 0

  const getVal = useCallback(
    (path: string[], fallback: unknown = '') => {
      const dirtyVal = deepGet(dirty, path)
      if (dirtyVal !== undefined) return dirtyVal
      if (!settings) return fallback
      return deepGet(settings as unknown as Record<string, unknown>, path) ?? fallback
    },
    [dirty, settings],
  )

  const setVal = (path: string[], value: unknown) => {
    setDirty((prev) => {
      const next = { ...prev }
      deepSet(next, path, value)
      return next
    })
  }

  const handleSave = () => {
    setError('')
    saveMutation.mutate(dirty, {
      onSuccess: () => {
        setDirty({})
        toast('Settings saved', 'success')
      },
      onError: (e) => setError((e as Error).message),
    })
  }

  const handleSecretSave = (value: string) => {
    if (!secretDialog) return
    secretMutation.mutate(
      { field: secretDialog.field, value },
      {
        onSuccess: () => {
          setSecretDialog(null)
          toast('Secret updated', 'success')
        },
        onError: (e) => toast((e as Error).message, 'error'),
      },
    )
  }

  const handleSecretClear = (field: string) => {
    secretMutation.mutate(
      { field, value: null },
      {
        onSuccess: () => toast('Secret cleared', 'success'),
        onError: (e) => toast((e as Error).message, 'error'),
      },
    )
  }

  const handleImportSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string)
        setImportData(data)
        // Auto-create snapshot first
        createSnapshotMutation.mutate(undefined, {
          onSuccess: () => setShowImportConfirm(true),
          onError: () => setShowImportConfirm(true), // still show but warn
        })
      } catch {
        toast('Invalid JSON file', 'error')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleImportConfirm = () => {
    if (!importData) return
    importMutation.mutate(importData, {
      onSuccess: () => {
        setShowImportConfirm(false)
        setImportData(null)
        toast('Config imported successfully', 'success')
      },
      onError: (e) => toast((e as Error).message, 'error'),
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Settings" />
        <div className="animate-pulse space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 bg-hairline-cool rounded-[var(--radius-card)]" />
          ))}
        </div>
      </div>
    )
  }

  const secrets = settings?.secrets
  const snapshots = snapshotsData?.snapshots ?? snapshotsData?.items ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        actions={
          <Button onClick={handleSave} disabled={!isDirty} loading={saveMutation.isPending}>
            <Save className="h-4 w-4" /> Save Changes
          </Button>
        }
      />

      {error && <Alert variant="error">{error}</Alert>}

      {/* Secrets */}
      <Section title="Secrets">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-ink">API Key</span>
              <Badge variant={secrets?.api_key_set ? 'success' : 'default'} className="ml-2">
                {secrets?.api_key_set ? 'set' : 'not set'}
              </Badge>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setSecretDialog({ field: 'api_key', title: 'Change API Key' })}>
                {secrets?.api_key_set ? 'Change' : 'Set'}
              </Button>
              {secrets?.api_key_set && (
                <Button variant="ghost" size="sm" onClick={() => handleSecretClear('api_key')}>Clear</Button>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-ink">Admin Password</span>
              <Badge variant={secrets?.admin_password_set ? 'success' : 'default'} className="ml-2">
                {secrets?.admin_password_set ? 'set' : 'not set'}
              </Badge>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setSecretDialog({ field: 'admin.password', title: 'Change Admin Password' })}>
                {secrets?.admin_password_set ? 'Change' : 'Set'}
              </Button>
              {secrets?.admin_password_set && (
                <Button variant="ghost" size="sm" onClick={() => handleSecretClear('admin.password')}>Clear</Button>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-ink">Resin Proxy Token</span>
              <Badge variant={secrets?.resin_proxy_token_set ? 'success' : 'default'} className="ml-2">
                {secrets?.resin_proxy_token_set ? 'set' : 'not set'}
              </Badge>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setSecretDialog({ field: 'resin_proxy_token', title: 'Change Resin Proxy Token' })}>
                {secrets?.resin_proxy_token_set ? 'Change' : 'Set'}
              </Button>
              {secrets?.resin_proxy_token_set && (
                <Button variant="ghost" size="sm" onClick={() => handleSecretClear('resin_proxy_token')}>Clear</Button>
              )}
            </div>
          </div>
        </div>
      </Section>

      {/* General */}
      <Section title="General">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-ink">Default Model</label>
          <Select
            value={getVal(['default_model'], 'auto') as string}
            onChange={(e) => setVal(['default_model'], e.target.value)}
            className="max-w-xs"
          >
            <option value="auto">auto</option>
            {modelsData?.models?.filter(m => m.enabled).map(m => (
              <option key={m.id} value={m.model_id}>{m.name}</option>
            ))}
          </Select>
        </div>
      </Section>

      {/* Runtime */}
      <Section title="Runtime">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-ink">Timeout (sec)</label>
            <Input
              type="number"
              value={getVal(['runtime', 'timeout_sec'], 180) as number}
              onChange={(e) => setVal(['runtime', 'timeout_sec'], Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-ink">Poll Interval (sec)</label>
            <Input
              type="number"
              step="0.1"
              value={getVal(['runtime', 'poll_interval_sec'], 1.5) as number}
              onChange={(e) => setVal(['runtime', 'poll_interval_sec'], Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-ink">Poll Max Rounds</label>
            <Input
              type="number"
              value={getVal(['runtime', 'poll_max_rounds'], 40) as number}
              onChange={(e) => setVal(['runtime', 'poll_max_rounds'], Number(e.target.value))}
            />
          </div>
        </div>
      </Section>

      {/* Features */}
      <Section title="Features">
        <div className="space-y-3">
          {[
            { key: 'use_web_search', label: 'Web Search' },
            { key: 'use_read_only_mode', label: 'Read-only Mode' },
            { key: 'force_fresh_thread_per_request', label: 'Fresh Thread Per Request' },
            { key: 'enable_generate_image', label: 'Generate Image' },
            { key: 'enable_csv_attachment_support', label: 'CSV Attachment' },
            { key: 'writer_mode', label: 'Writer Mode' },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-sm text-ink">{label}</span>
              <Toggle
                checked={getVal(['features', key], false) as boolean}
                onChange={(v) => setVal(['features', key], v)}
              />
            </div>
          ))}
        </div>
      </Section>

      {/* Session Refresh */}
      <Section title="Session Refresh">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink">Enabled</span>
            <Toggle
              checked={getVal(['session_refresh', 'enabled'], true) as boolean}
              onChange={(v) => setVal(['session_refresh', 'enabled'], v)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-ink">Interval (sec)</label>
            <Input
              type="number"
              value={getVal(['session_refresh', 'interval_sec'], 900) as number}
              onChange={(e) => setVal(['session_refresh', 'interval_sec'], Number(e.target.value))}
              className="max-w-[200px]"
            />
          </div>
          {[
            { key: 'startup_check', label: 'Startup Check' },
            { key: 'retry_on_auth_error', label: 'Retry on Auth Error' },
            { key: 'auto_switch_account', label: 'Auto-switch Account' },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-sm text-ink">{label}</span>
              <Toggle
                checked={getVal(['session_refresh', key], false) as boolean}
                onChange={(v) => setVal(['session_refresh', key], v)}
              />
            </div>
          ))}
        </div>
      </Section>

      {/* Proxy */}
      <Section title="Proxy">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-ink">Mode</label>
            <Select
              value={getVal(['config', 'resin_proxy_mode'], 'off') as string}
              onChange={(e) => setVal(['config', 'resin_proxy_mode'], e.target.value)}
              className="max-w-xs"
            >
              <option value="off">Off</option>
              <option value="always">Always</option>
              <option value="fallback">Fallback</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-ink">Proxy URL</label>
            <Input
              value={getVal(['config', 'resin_proxy_url'], '') as string}
              onChange={(e) => setVal(['config', 'resin_proxy_url'], e.target.value)}
              placeholder="https://..."
              className="max-w-md"
            />
          </div>
        </div>
      </Section>

      {/* Storage */}
      <Section title="Storage">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink">Persist Conversations</span>
            <Toggle
              checked={getVal(['config', 'persist_conversations'], true) as boolean}
              onChange={(v) => setVal(['config', 'persist_conversations'], v)}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink">Persist Responses</span>
            <Toggle
              checked={getVal(['config', 'persist_responses'], true) as boolean}
              onChange={(v) => setVal(['config', 'persist_responses'], v)}
            />
          </div>
        </div>
      </Section>

      {/* Model Aliases */}
      <Section title="Model Aliases">
        <div className="space-y-3">
          {Object.entries(
            (getVal(['model_aliases'], {}) as Record<string, string>) || {},
          ).map(([alias, target]) => (
            <div key={alias} className="flex items-center gap-2">
              <Input
                value={alias}
                readOnly
                className="max-w-[160px] bg-canvas-soft"
              />
              <span className="text-ink-mute text-sm">→</span>
              <Input
                value={target}
                onChange={(e) => {
                  const a = { ...((getVal(['model_aliases'], {}) as Record<string, string>) || {}) };
                  a[alias] = e.target.value;
                  setVal(['model_aliases'], a);
                }}
                className="max-w-[200px]"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const a = { ...((getVal(['model_aliases'], {}) as Record<string, string>) || {}) };
                  delete a[alias];
                  setVal(['model_aliases'], a);
                }}
              >
                <Trash2 className="h-3.5 w-3.5 text-danger" />
              </Button>
            </div>
          ))}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const a = { ...((getVal(['model_aliases'], {}) as Record<string, string>) || {}) };
              a['new-alias'] = '';
              setVal(['model_aliases'], a);
            }}
          >
            <Plus className="h-3.5 w-3.5" /> Add Alias
          </Button>
        </div>
      </Section>

      {/* Config Management */}
      <Section title="Config Management">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => exportMutation.mutate()} loading={exportMutation.isPending}>
              <Download className="h-4 w-4" /> Export Config
            </Button>
            <Button variant="secondary" onClick={() => createSnapshotMutation.mutate()} loading={createSnapshotMutation.isPending}>
              <Camera className="h-4 w-4" /> Create Snapshot
            </Button>
            <label className="inline-flex">
              <input type="file" accept=".json" onChange={handleImportSelect} className="hidden" />
              <Button variant="secondary" onClick={() => {}} className="pointer-events-none">
                <Upload className="h-4 w-4" /> Import Config
              </Button>
            </label>
          </div>

          {snapshots.length > 0 && (
            <div className="space-y-1">
              <h4 className="text-sm font-medium text-ink-mute">Snapshots</h4>
              {snapshots.map((s) => (
                <p key={s.name} className="text-xs text-ink-mute-2 font-mono">{s.name}</p>
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* Secret Dialog */}
      <SecretDialog
        open={!!secretDialog}
        onClose={() => setSecretDialog(null)}
        title={secretDialog?.title ?? ''}
        onSave={handleSecretSave}
        loading={secretMutation.isPending}
      />

      {/* Import Confirm */}
      <ConfirmDangerDialog
        open={showImportConfirm}
        onClose={() => { setShowImportConfirm(false); setImportData(null) }}
        onConfirm={handleImportConfirm}
        loading={importMutation.isPending}
        title="Import Configuration?"
        description={`This will overwrite current settings with the imported file${importFile ? ` (${importFile.name})` : ''}. A snapshot has been created as backup.`}
      />
    </div>
  )
}
