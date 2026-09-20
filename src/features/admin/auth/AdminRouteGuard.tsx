import type { FC, ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../auth'

interface AdminRouteGuardProps {
  children: ReactNode
}

export const AdminRouteGuard: FC<AdminRouteGuardProps> = ({ children }) => {
  const { user, role, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-stone-900 text-stone-200">
        <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium tracking-wide">Đang xác thực quyền Quản trị...</p>
      </div>
    )
  }

  // Not signed in or not an active admin
  if (!user || role !== 'admin') {
    return <Navigate to="/admin/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}
