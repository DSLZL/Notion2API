import { useState, useCallback, createContext, useContext, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { X } from 'lucide-react'

type ToastVariant = 'default' | 'success' | 'error'
interface Toast { id: number; message: string; variant: ToastVariant }
interface ToastContextValue { toast: (message: string, variant?: ToastVariant) => void }
const ToastContext = createContext<ToastContextValue>({ toast: () => {} })
export function useToast() { return useContext(ToastContext) }
let nextId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const toast = useCallback((message: string, variant: ToastVariant = 'default') => {
    const id = ++nextId
    setToasts((t) => [...t, { id, message, variant }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000)
  }, [])
  const dismiss = useCallback((id: number) => { setToasts((t) => t.filter((x) => x.id !== id)) }, [])
  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={cn(
            'flex items-center gap-2 rounded-[var(--radius-card)] px-4 py-3 text-sm shadow-[var(--shadow-2)] min-w-[260px]',
            t.variant === 'error' && 'bg-danger text-white',
            t.variant === 'success' && 'bg-primary text-on-primary',
            t.variant === 'default' && 'bg-canvas-night text-on-dark',
          )}>
            <span className="flex-1">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="opacity-70 hover:opacity-100"><X className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
