import { useState, useEffect } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { useManualImport } from '@/lib/hooks/use-accounts'

export function ManualImportDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [mode, setMode] = useState<'cookie' | 'probe'>('cookie')
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const importMutation = useManualImport()

  useEffect(() => {
    if (open) {
      setMode('cookie')
      setValue('')
      setError('')
    }
  }, [open])

  const handleImport = () => {
    setError('')
    const body =
      mode === 'cookie'
        ? { cookie_header: value }
        : { probe_json_text: value }

    importMutation.mutate(body, {
      onSuccess: (res) => {
        if (res.success) {
          onClose()
        } else {
          setError(res.message || 'Import failed')
        }
      },
      onError: (e) => setError((e as Error).message),
    })
  }

  return (
    <Dialog open={open} onClose={onClose} title="Manual Import">
      <div className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}

        <div className="flex gap-2">
          <Button
            variant={mode === 'cookie' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => { setMode('cookie'); setValue('') }}
          >
            Cookie Header
          </Button>
          <Button
            variant={mode === 'probe' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => { setMode('probe'); setValue('') }}
          >
            Probe JSON
          </Button>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-ink">
            {mode === 'cookie' ? 'Cookie Header' : 'Probe JSON'}
          </label>
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={
              mode === 'cookie'
                ? 'Paste the Cookie header value...'
                : 'Paste the probe.json content...'
            }
            rows={6}
          />
          <p className="text-xs text-ink-mute">
            {mode === 'cookie'
              ? 'Copy the Cookie header from browser DevTools (Network tab).'
              : 'Paste the full content of the probe.json file.'}
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleImport}
            disabled={!value.trim()}
            loading={importMutation.isPending}
          >
            Import
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
