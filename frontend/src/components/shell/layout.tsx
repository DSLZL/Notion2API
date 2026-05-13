import { Outlet } from 'react-router'
import { Sidebar } from './sidebar'
import { useSSE } from '@/lib/hooks/use-sse'

export function Layout() {
  useSSE()

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
