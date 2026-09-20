import { createContext, useContext } from 'react'

export interface AdminContextType {
  lastRefreshedAt: Date
  refreshKey: number
  triggerRefresh: () => void
  isRefreshing: boolean
}

export const AdminContext = createContext<AdminContextType>({
  lastRefreshedAt: new Date(),
  refreshKey: 0,
  triggerRefresh: () => {},
  isRefreshing: false,
})

export const useAdmin = () => useContext(AdminContext)
