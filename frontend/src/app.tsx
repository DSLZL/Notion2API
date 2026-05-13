import { HashRouter, Routes, Route, Navigate, Outlet } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useVerify } from '@/lib/hooks/use-auth'
import { ToastProvider } from '@/components/ui/toast'
import { Layout } from '@/components/shell/layout'
import { LoginPage } from '@/pages/login'
import { DashboardPage } from '@/pages/dashboard'
import { AccountsPage } from '@/pages/accounts/index'
import TesterPage from '@/pages/tester'
import ConversationsPage from '@/pages/conversations'
import SettingsPage from '@/pages/settings'
import { ModelsPage } from '@/pages/models'
import { Skeleton } from '@/components/ui/skeleton'
import { ThemeProvider } from '@/lib/theme'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

function AuthGuard() {
  const { data, isLoading, isError } = useVerify()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-8 w-32" />
      </div>
    )
  }

  if (isError || !data?.authenticated) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AuthGuard />}>
        <Route element={<Layout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/accounts" element={<AccountsPage />} />
          <Route path="/models" element={<ModelsPage />} />
          <Route path="/tester" element={<TesterPage />} />
          <Route path="/conversations" element={<ConversationsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <HashRouter>
            <AppRoutes />
          </HashRouter>
        </ToastProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
