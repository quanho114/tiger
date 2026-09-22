import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AdminReportsPage } from '../../src/features/admin/reports/AdminReportsPage'

describe('AdminReportsPage Component (Elera Redesign)', () => {
  it('renders report header, KPI tiles, and time switchers', () => {
    render(<AdminReportsPage />)

    // Heading and badge
    expect(screen.getByText('Báo cáo & Doanh thu Vận hành')).toBeInTheDocument()
    expect(screen.getByText('Thời gian thực')).toBeInTheDocument()

    // 4 KPI Stats
    expect(screen.getByText('Gross Revenue')).toBeInTheDocument()
    expect(screen.getByText('Room Occupancy')).toBeInTheDocument()
    expect(screen.getByText('Seen vs Scheduled')).toBeInTheDocument()
    expect(screen.getByText('Staff Utilization')).toBeInTheDocument()

    // Live table card
    expect(screen.getByText('Live Occupancy')).toBeInTheDocument()
    expect(screen.getAllByText('15')[0]).toBeInTheDocument()

    // Peak Activity card
    expect(screen.getByText('Peak Activity Times Today')).toBeInTheDocument()
    expect(screen.getByText('Avg. wait time')).toBeInTheDocument()

    // Dark Heatmap Calendar card
    expect(screen.getByText('April Patient Volume')).toBeInTheDocument()

    // Bubble chart card
    expect(screen.getByText('Daily Caseload')).toBeInTheDocument()

    // Staff tasks card
    expect(screen.getByText('Staff Tasks & Authorizations')).toBeInTheDocument()
  })

  it('switches time range and updates statistics', () => {
    render(<AdminReportsPage />)

    // Switch to 7 days
    const weekBtn = screen.getByRole('button', { name: '7 ngày qua' })
    fireEvent.click(weekBtn)

    // Revenue updates to 54.800.000đ
    expect(screen.getByText(/54\.800\.000/)).toBeInTheDocument()

    // Switch to Month
    const monthBtn = screen.getByRole('button', { name: 'Tháng này' })
    fireEvent.click(monthBtn)

    // Revenue updates to 168.500.000đ
    expect(screen.getByText(/168\.500\.000/)).toBeInTheDocument()
  })

  it('displays notification toast when clicking operational task buttons', () => {
    render(<AdminReportsPage />)

    const appealBtn = screen.getByRole('button', { name: 'Appeal' })
    fireEvent.click(appealBtn)

    expect(screen.getByText(/Đã gửi kháng nghị thanh toán bảo hiểm/)).toBeInTheDocument()
  })
})
