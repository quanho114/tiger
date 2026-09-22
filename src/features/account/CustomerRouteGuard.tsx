import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/features/auth'

interface CustomerRouteGuardProps {
  children?: ReactNode
}

export function CustomerRouteGuard({ children }: CustomerRouteGuardProps) {
  const { user, role, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin text-amber-600 mb-3" />
        <p className="text-sm font-medium">Đang tải thông tin tài khoản...</p>
      </div>
    )
  }

  if (!user) {
    const returnTo = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />
  }

  // Admin users should not see customer account dashboards; redirect to /admin
  if (role === 'admin') {
    return <Navigate to="/admin" replace />
  }

  return children ? <>{children}</> : null
}
