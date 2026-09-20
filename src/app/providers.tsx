import type { ReactNode } from 'react'
import { AuthProvider } from '../features/auth'
import { CatalogProvider } from '../features/catalog'
import { TableSessionProvider } from '../features/table-session'

interface AppProvidersProps {
  children: ReactNode
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <AuthProvider>
      <CatalogProvider>
        <TableSessionProvider>{children}</TableSessionProvider>
      </CatalogProvider>
    </AuthProvider>
  )
}

