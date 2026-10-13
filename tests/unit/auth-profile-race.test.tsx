import { useContext } from 'react'
import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import { AuthProvider } from '../../src/features/auth/AuthProvider'
import { AuthContext } from '../../src/features/auth/AuthContext'

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), profile: vi.fn(), onAuth: vi.fn(), signOut: vi.fn() }))
vi.mock('@/shared/lib/supabase', () => ({ supabase: {
  auth: { getSession: mocks.getSession, onAuthStateChange: mocks.onAuth, signOut: mocks.signOut },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.profile }) }) }),
} }))
const session = { user: { id: 'admin-id', email: 'admin@example.test' } } as Session
function Status() {
  const auth = useContext(AuthContext)!
  return <span>{auth.role}:{auth.user?.id || 'none'}</span>
}
let callback: (event: string, session: Session | null) => void
beforeEach(() => {
  vi.resetAllMocks()
  mocks.onAuth.mockImplementation(cb => { callback = cb; return { data: { subscription: { unsubscribe: vi.fn() } } } })
})
describe('Auth profile race protection', () => {
  it('does not let a delayed startup guest session overwrite a successful login', async () => {
    let finishStartup!: (value: { data: { session: null } }) => void
    mocks.getSession.mockReturnValue(new Promise(resolve => { finishStartup = resolve }))
    mocks.profile.mockResolvedValue({ data: { user_id: 'admin-id', display_name: 'Admin', active: true } })
    render(<AuthProvider><Status /></AuthProvider>)
    await act(async () => { callback('SIGNED_IN', session) })
    expect(screen.getByText('admin:admin-id')).toBeInTheDocument()
    await act(async () => { finishStartup({ data: { session: null } }) })
    expect(screen.getByText('admin:admin-id')).toBeInTheDocument()
  })
  it('does not restore admin state when a pending profile fetch finishes after logout', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } })
    let finishProfile!: (value: unknown) => void
    mocks.profile.mockReturnValue(new Promise(resolve => { finishProfile = resolve }))
    render(<AuthProvider><Status /></AuthProvider>)
    await act(async () => {})
    await act(async () => { callback('SIGNED_IN', session) })
    await act(async () => { callback('SIGNED_OUT', null) })
    await act(async () => { finishProfile({ data: { user_id: 'admin-id', display_name: 'Admin', active: true } }) })
    expect(screen.getByText('guest:none')).toBeInTheDocument()
  })
})
