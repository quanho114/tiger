import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { useConcierge, type UseConciergeReturn } from './useConcierge'

const ConciergeContext = createContext<UseConciergeReturn | null>(null)

export function ConciergeProvider({ children }: { children: ReactNode }) {
  const session = useConcierge()
  return <ConciergeContext.Provider value={session}>{children}</ConciergeContext.Provider>
}

export function useConciergeSession() {
  const session = useContext(ConciergeContext)
  if (!session) throw new Error('ConciergeProvider is required')
  return session
}

export function useOptionalConciergeSession() {
  return useContext(ConciergeContext)
}
