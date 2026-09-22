import type { FC, ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../auth'
import { AdminLoading } from '../components/AdminLoading'

interface AdminRouteGuardProps {
  children: ReactNode
}

export const AdminRouteGuard: FC<AdminRouteGuardProps> = ({ children }) => {
  const { user, role, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <AdminLoading variant="screen" label="Đang xác thực quyền Quản trị..." />
  }

  // Not signed in or not an active admin
  if (!user || role !== 'admin') {
    return <Navigate to="/admin/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}
