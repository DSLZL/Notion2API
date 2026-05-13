import { useState, useEffect } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { useStartEmailLogin, useVerifyEmailLogin } from '@/lib/hooks/use-accounts'

type Step = 'email' | 'code' | 'done'

export function EmailLoginDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  const startMutation = useStartEmailLogin()
  const verifyMutation = useVerifyEmailLogin()

  useEffect(() => {
    if (open) {
      setStep('email')
      setEmail('')
      setCode('')
      setError('')
    }
  }, [open])

  const handleStart = () => {
    setError('')
    startMutation.mutate(email, {
      onSuccess: (res) => {
        if (res.success) {
          setStep('code')
        } else {
          setError(res.message || 'Failed to start login')
        }
      },
      onError: (e) => setError((e as Error).message),
    })
  }

  const handleVerify = () => {
    setError('')
    verifyMutation.mutate(
      { email, code },
      {
        onSuccess: (res) => {
          if (res.success) {
            setStep('done')
          } else {
            setError(res.message || 'Verification failed')
          }
        },
        onError: (e) => setError((e as Error).message),
      },
    )
  }

  return (
    <Dialog open={open} onClose={onClose} title="Email Login">
      <div className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}

        {step === 'email' && (
          <>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink">Notion Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alice@example.com"
                onKeyDown={(e) => e.key === 'Enter' && email && handleStart()}
              />
            </div>
            <p className="text-xs text-ink-mute">
              A temporary login code will be sent to this email via Notion.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
              <Button onClick={handleStart} disabled={!email} loading={startMutation.isPending}>
                Send Code
              </Button>
            </div>
          </>
        )}

        {step === 'code' && (
          <>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink">Verification Code</label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Enter code from email..."
                onKeyDown={(e) => e.key === 'Enter' && code && handleVerify()}
              />
            </div>
            <p className="text-xs text-ink-mute">
              Check your email ({email}) for the code from Notion.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setStep('email')}>Back</Button>
              <Button onClick={handleVerify} disabled={!code} loading={verifyMutation.isPending}>
                Verify
              </Button>
            </div>
          </>
        )}

        {step === 'done' && (
          <>
            <p className="text-sm text-ink">Account added successfully!</p>
            <div className="flex justify-end">
              <Button onClick={onClose}>Done</Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  )
}
