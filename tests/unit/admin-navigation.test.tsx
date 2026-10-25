import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AdminLayout } from '@/features/admin/layout/AdminLayout'

vi.mock('@/features/auth', () => ({
  useAuth: () => ({ adminProfile: { displayName: 'Test Admin' }, signOut: vi.fn() }),
}))
vi.mock('@/shared/lib/api/client', () => ({
  adminApi: { get: vi.fn().mockResolvedValue({ data: {} }) },
}))

let desktop = false
let onBreakpointChange: (() => void) | undefined

beforeEach(() => {
  desktop = false
  onBreakpointChange = undefined
  vi.stubGlobal('matchMedia', () => ({
    get matches() { return desktop },
    addEventListener: (_: string, listener: () => void) => { onBreakpointChange = listener },
    removeEventListener: vi.fn(),
  }))
})
afterEach(() => vi.unstubAllGlobals())

function renderAdmin() {
  render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<p>Dashboard test</p>} />
          <Route path="orders" element={<p>Orders test</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('Admin tablet navigation', () => {
  it('locks scrolling while open, closes on Escape and restores trigger focus', async () => {
    renderAdmin()
    const trigger = screen.getByRole('button', { name: 'Mở menu quản trị' })
    trigger.focus()
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'))
    expect(document.body.style.overflow).toBe('')
    expect(trigger).toHaveFocus()
  })

  it('closes the drawer after choosing a destination', async () => {
    renderAdmin()
    fireEvent.click(screen.getByRole('button', { name: 'Mở menu quản trị' }))
    fireEvent.click(screen.getByRole('link', { name: /Đơn hàng/ }))
    expect(await screen.findByText('Orders test')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mở menu quản trị' })).toHaveAttribute('aria-expanded', 'false')
    expect(document.body.style.overflow).toBe('')
  })

  it('releases the scroll lock when switching to the desktop layout', async () => {
    renderAdmin()
    fireEvent.click(screen.getByRole('button', { name: 'Mở menu quản trị' }))
    desktop = true
    // A real MediaQueryList emits change when the desktop breakpoint is crossed.
    act(() => onBreakpointChange?.())
    expect(document.body.style.overflow).toBe('')
    expect(screen.getByRole('button', { name: 'Mở menu quản trị' })).toHaveAttribute('aria-expanded', 'false')
  })
})
