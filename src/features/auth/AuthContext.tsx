import { createContext } from 'react'
import type { User, Session } from '@supabase/supabase-js'

export type AuthRole = 'guest' | 'customer' | 'admin'

export interface CustomerProfile {
  userId: string
  displayName: string | null
  phone: string | null
  avatarUrl: string | null
  marketingOptIn: boolean
}

export interface AdminProfile {
  userId: string
  displayName: string | null
  active: boolean
}

export interface AuthState {
  user: User | null
  session: Session | null
  role: AuthRole
  customerProfile: CustomerProfile | null
  adminProfile: AdminProfile | null
  isLoading: boolean
  error: string | null
  signOut: () => Promise<void>
  refreshSession: () => Promise<void>
}

export const AuthContext = createContext<AuthState | undefined>(undefined)
