import { useContext } from 'react'
import { CatalogContext, type CatalogContextValue } from './CatalogContext'

export function useCatalog(): CatalogContextValue {
  const context = useContext(CatalogContext)
  if (!context) {
    throw new Error('useCatalog must be used within a CatalogProvider')
  }
  return context
}
