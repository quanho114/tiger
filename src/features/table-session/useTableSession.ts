import { useContext } from 'react'
import { TableSessionContext, type TableSessionContextValue } from './TableSessionContext'

export function useTableSession(): TableSessionContextValue {
  const ctx = useContext(TableSessionContext)
  if (!ctx) {
    throw new Error('useTableSession must be used within TableSessionProvider')
  }
  return ctx
}
