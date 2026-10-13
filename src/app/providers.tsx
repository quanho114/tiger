import type { ReactNode } from 'react'
import { AuthProvider } from '../features/auth'
import { CatalogProvider } from '../features/catalog'
import { TableSessionProvider } from '../features/table-session'
import { CartProvider } from '../features/cart'
import { ConciergeProvider } from '../features/concierge/ConciergeProvider'

interface AppProvidersProps {
  children: ReactNode
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <AuthProvider>
      <CatalogProvider>
        <TableSessionProvider>
          <CartProvider>
            <ConciergeProvider>{children}</ConciergeProvider>
          </CartProvider>
        </TableSessionProvider>
      </CatalogProvider>
    </AuthProvider>
  )
}
