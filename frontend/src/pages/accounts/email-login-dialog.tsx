import { useState, useEffect } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { useStartEmailLogin, useVerifyEmailLogin } from '@/lib/hooks/use-accounts'
import { useI18n } from '@/lib/i18n'

type Step = 'email' | 'code' | 'done'

export function EmailLoginDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { t } = useI18n()
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
          setError(res.message || t('emailLogin.startFailed'))
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
            setError(res.message || t('emailLogin.verifyFailed'))
          }
        },
        onError: (e) => setError((e as Error).message),
      },
    )
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('emailLogin.title')}>
      <div className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}

        {step === 'email' && (
          <>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink">{t('emailLogin.notionEmail')}</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('emailLogin.emailPlaceholder')}
                onKeyDown={(e) => e.key === 'Enter' && email && handleStart()}
              />
            </div>
            <p className="text-xs text-ink-mute">
              {t('emailLogin.codeWillBeSent')}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
              <Button onClick={handleStart} disabled={!email} loading={startMutation.isPending}>
                {t('emailLogin.sendCode')}
              </Button>
            </div>
          </>
        )}

        {step === 'code' && (
          <>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink">{t('emailLogin.verifyCode')}</label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={t('emailLogin.codePlaceholder')}
                onKeyDown={(e) => e.key === 'Enter' && code && handleVerify()}
              />
            </div>
            <p className="text-xs text-ink-mute">
              {t('emailLogin.checkEmailCode', { email })}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setStep('email')}>{t('common.back')}</Button>
              <Button onClick={handleVerify} disabled={!code} loading={verifyMutation.isPending}>
                {t('emailLogin.verify')}
              </Button>
            </div>
          </>
        )}

        {step === 'done' && (
          <>
            <p className="text-sm text-ink">{t('emailLogin.success')}</p>
            <div className="flex justify-end">
              <Button onClick={onClose}>{t('common.done')}</Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  )
}
