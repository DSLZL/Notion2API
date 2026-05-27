import { useState, useEffect } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { useManualImport } from '@/lib/hooks/use-accounts'
import { useI18n } from '@/lib/i18n'

export function ManualImportDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { t } = useI18n()
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
          setError(res.message || t('manualImport.failed'))
        }
      },
      onError: (e) => setError((e as Error).message),
    })
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('manualImport.title')}>
      <div className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}

        <div className="flex gap-2">
          <Button
            variant={mode === 'cookie' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => { setMode('cookie'); setValue('') }}
          >
            {t('manualImport.modeCookie')}
          </Button>
          <Button
            variant={mode === 'probe' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => { setMode('probe'); setValue('') }}
          >
            {t('manualImport.modeProbe')}
          </Button>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-ink">
            {mode === 'cookie' ? t('manualImport.fieldCookie') : t('manualImport.fieldProbe')}
          </label>
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={
              mode === 'cookie'
                ? t('manualImport.placeholderCookie')
                : t('manualImport.placeholderProbe')
            }
            rows={6}
          />
          <p className="text-xs text-ink-mute">
            {mode === 'cookie'
              ? t('manualImport.helpCookie')
              : t('manualImport.helpProbe')}
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            onClick={handleImport}
            disabled={!value.trim()}
            loading={importMutation.isPending}
          >
            {t('common.import')}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
