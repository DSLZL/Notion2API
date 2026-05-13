import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { useVerify, useLogin } from '@/lib/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'

export function LoginPage() {
  const navigate = useNavigate()
  const verify = useVerify()
  const login = useLogin()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  // If already authenticated, redirect to dashboard
  useEffect(() => {
    if (verify.data?.authenticated) {
      navigate('/', { replace: true })
    }
  }, [verify.data, navigate])

  // Loading state
  if (verify.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas-soft">
        <div className="w-full max-w-sm space-y-4 p-6">
          <Skeleton className="mx-auto h-10 w-10" />
          <Skeleton className="h-6 w-48 mx-auto" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
    )
  }

  // Needs setup – show setup hint
  if (verify.data?.needs_setup) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas-soft">
        <div className="w-full max-w-sm rounded-[var(--radius-card)] border border-hairline bg-canvas p-8 shadow-[var(--shadow-2)]">
          <div className="mb-6 flex justify-center">
            <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-lg font-bold text-on-primary">N</span>
            </div>
          </div>
          <h1 className="text-center text-lg font-semibold text-ink">Setup Required</h1>
          <p className="mt-2 text-center text-sm text-ink-mute">
            Please set an admin password via environment variable or config file before using the admin panel.
          </p>
        </div>
      </div>
    )
  }

  // Verify error (network / server issue)
  if (verify.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas-soft">
        <div className="w-full max-w-sm rounded-[var(--radius-card)] border border-hairline bg-canvas p-8 shadow-[var(--shadow-2)]">
          <Alert variant="error">
            Cannot connect to the server. Please check that the backend is running.
          </Alert>
          <Button variant="secondary" className="mt-4 w-full" onClick={() => verify.refetch()}>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      const res = await login.mutateAsync(password)
      if (res.success) {
        navigate('/', { replace: true })
      } else {
        setError(res.message || 'Login failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas-soft">
      <div className="w-full max-w-sm rounded-[var(--radius-card)] border border-hairline bg-canvas p-8 shadow-[var(--shadow-2)]">
        {/* Logo */}
        <div className="mb-6 flex justify-center">
          <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-lg font-bold text-on-primary">N</span>
          </div>
        </div>
        <h1 className="text-center text-lg font-semibold text-ink">Notion2API Admin</h1>
        <p className="mt-1 text-center text-sm text-ink-mute">Sign in to continue</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && <Alert variant="error">{error}</Alert>}
          <Input
            type="password"
            placeholder="Admin password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          <Button type="submit" className="w-full" loading={login.isPending}>
            Sign In
          </Button>
        </form>
      </div>
    </div>
  )
}
