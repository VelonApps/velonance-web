import { Component, lazy, Suspense } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import Protected from './components/Protected'
import Login from './pages/Login'
import { Button, Loading, ToastProvider } from './components/ui'
import './styles.css'
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Transactions = lazy(() => import('./pages/Transactions'))
const Portfolio = lazy(() => import('./pages/Portfolio'))
const Accounts = lazy(() => import('./pages/Accounts'))
const Obligations = lazy(() => import('./pages/Obligations'))
const Recurring = lazy(() => import('./pages/Recurring'))
const Reports = lazy(() => import('./pages/Reports'))
const SettingsPage = lazy(() => import('./pages/Settings'))
const CashFlow = lazy(() => import('./pages/CashFlow'))
const Activity = lazy(() => import('./pages/Activity'))
const AccountStatement = lazy(() => import('./pages/AccountStatement'))
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) =>
        !(error as { code?: string }).code?.includes('permission-denied') && count < 1,
      refetchOnWindowFocus: false,
      gcTime: 5 * 60 * 1000,
    },
  },
})
class ErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false }
  static getDerivedStateFromError() {
    return { error: true }
  }
  componentDidCatch() {
    /* Financial data never logged. */
  }
  render() {
    return this.state.error ? (
      <div className="fatal">
        <h1>Beklenmeyen bir hata oluştu.</h1>
        <p>Kaydedilmeyen form verileri dışında kayıtlarınız Firestore’da korunur.</p>
        <Button onClick={() => location.reload()}>Sayfayı yenile</Button>
      </div>
    ) : (
      this.props.children
    )
  }
}
function App() {
  const { authorization } = useAuth()
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={authorization ? <Navigate to="/" replace /> : <Login />} />
        <Route element={<Protected />}>
          <Route index element={<Dashboard />} />
          <Route path="income" element={<Transactions kind="income" />} />
          <Route path="expenses" element={<Transactions kind="expense" />} />
          <Route path="history" element={<Transactions />} />
          <Route path="applications" element={<Portfolio />} />
          <Route path="applications/:id" element={<Portfolio />} />
          <Route path="accounts" element={<Accounts />} />
          <Route path="accounts/:id" element={<AccountStatement />} />
          <Route path="obligations" element={<Obligations />} />
          <Route path="recurring" element={<Recurring />} />
          <Route path="cash-flow" element={<CashFlow />} />
          <Route path="reports" element={<Reports />} />
          <Route path="activity" element={<Activity />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
const reactRoot = import.meta.hot?.data.reactRoot ?? createRoot(document.getElementById('root')!)
if (import.meta.hot) import.meta.hot.data.reactRoot = reactRoot
reactRoot.render(
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </HashRouter>
    </QueryClientProvider>
  </ErrorBoundary>,
)
