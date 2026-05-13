import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export interface ConfirmDangerDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description?: string
  confirmLabel?: string
  loading?: boolean
}

export function ConfirmDangerDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Delete',
  loading,
}: ConfirmDangerDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      {description && <p className="mb-6 text-sm text-ink-mute">{description}</p>}
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="danger" onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
      </div>
    </Dialog>
  )
}
