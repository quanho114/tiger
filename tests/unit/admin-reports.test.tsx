import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AdminReportsPage } from '../../src/features/admin/reports/AdminReportsPage'
import { adminApi } from '@/shared/lib/api/client'
vi.mock('@/shared/lib/api/client', () => ({ adminApi: { get: vi.fn() } }))
const report = { net_revenue: 123456, received: 150000, reversed: 26544, payment_count: 2, cash: 123456, bank_transfer: 0, daily: [] }
beforeEach(() => vi.resetAllMocks())
describe('Admin reports from backend', () => {
  it('renders returned amounts and requests the selected date range', async () => {
    vi.mocked(adminApi.get).mockResolvedValue({ data: report, requestId: 'test' })
    render(<AdminReportsPage />)
    expect(await screen.findByText('150.000đ')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '7 ngày qua' }))
    await waitFor(() => expect(adminApi.get).toHaveBeenLastCalledWith('/reports?range=7days'))
  })
  it('shows failures without replacing them with sample revenue', async () => {
    vi.mocked(adminApi.get).mockRejectedValue(new Error('Máy chủ không phản hồi'))
    render(<AdminReportsPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Máy chủ không phản hồi')
    expect(screen.queryByText('8.450.000đ')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Xuất CSV' })).toBeDisabled()
  })
})
