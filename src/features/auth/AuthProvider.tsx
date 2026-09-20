import { useState, useEffect, useCallback, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import {
  AuthContext,
  type AuthRole,
  type CustomerProfile,
  type AdminProfile,
} from './AuthContext'

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<AuthRole>('guest')
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile | null>(null)
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const resolveUserProfile = useCallback(async (currentSession: Session | null) => {
    if (!currentSession?.user) {
      setSession(null)
      setUser(null)
      setRole('guest')
      setCustomerProfile(null)
      setAdminProfile(null)
      setIsLoading(false)
      return
    }

    const currentUser = currentSession.user
    setSession(currentSession)
    setUser(currentUser)

    try {
      // 1. Check admin_profiles
      const { data: adminData } = await supabase
        .from('admin_profiles')
        .select('user_id, display_name, active')
        .eq('user_id', currentUser.id)
        .maybeSingle()

      if (adminData && adminData.active) {
        setRole('admin')
        setAdminProfile({
          userId: adminData.user_id,
          displayName: adminData.display_name,
          active: adminData.active,
        })
        setCustomerProfile(null)
        setIsLoading(false)
        return
      }

      // 2. Check customer_profiles
      const { data: customerData } = await supabase
        .from('customer_profiles')
        .select('user_id, display_name, phone, avatar_url, marketing_opt_in, deletion_requested_at')
        .eq('user_id', currentUser.id)
        .maybeSingle()

      if (customerData) {
        if (customerData.deletion_requested_at) {
          setError('Tài khoản đã được yêu cầu xóa và bị vô hiệu hóa.')
          setRole('guest')
          setCustomerProfile(null)
          setAdminProfile(null)
          setIsLoading(false)
          return
        }

        setRole('customer')
        setCustomerProfile({
          userId: customerData.user_id,
          displayName: customerData.display_name,
          phone: customerData.phone,
          avatarUrl: customerData.avatar_url,
          marketingOptIn: customerData.marketing_opt_in,
        })
        setAdminProfile(null)
        setIsLoading(false)
        return
      }

      // Default to customer role if signed in via auth
      setRole('customer')
      setCustomerProfile({
        userId: currentUser.id,
        displayName: currentUser.user_metadata?.full_name || currentUser.email || 'Khách hàng',
        phone: currentUser.phone || null,
        avatarUrl: currentUser.user_metadata?.avatar_url || null,
        marketingOptIn: false,
      })
      setAdminProfile(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể tải thông tin tài khoản')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    let mounted = true

    async function initAuth() {
      try {
        const { data } = await supabase.auth.getSession()
        if (mounted) {
          await resolveUserProfile(data.session)
        }
      } catch (err: unknown) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Lỗi xác thực')
          setIsLoading(false)
        }
      }
    }

    void initAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (mounted) {
        void resolveUserProfile(newSession)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [resolveUserProfile])

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut()
    } catch {
      // Ignore network errors on signout
    } finally {
      setSession(null)
      setUser(null)
      setRole('guest')
      setCustomerProfile(null)
      setAdminProfile(null)
    }
  }, [])

  const refreshSession = useCallback(async () => {
    setIsLoading(true)
    const { data } = await supabase.auth.getSession()
    await resolveUserProfile(data.session)
  }, [resolveUserProfile])

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        role,
        customerProfile,
        adminProfile,
        isLoading,
        error,
        signOut,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
