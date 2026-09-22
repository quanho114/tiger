import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AdminMenuPage } from '../../src/features/admin/menu/AdminMenuPage'

describe('AdminMenuPage Component (Elera Redesign)', () => {
  it('renders menu header, 4 overview cards, search and table', () => {
    render(<AdminMenuPage />)

    // Heading and badge
    expect(screen.getByText('Quản lý Thực đơn & Bếp')).toBeInTheDocument()
    expect(screen.getByText('6 món hoạt động')).toBeInTheDocument()

    // 4 KPI Overview
    expect(screen.getByText('Tổng số món')).toBeInTheDocument()
    expect(screen.getByText('Đang phục vụ')).toBeInTheDocument()
    expect(screen.getByText('Tạm hết món')).toBeInTheDocument()

    // Table items
    expect(screen.getByText('Bò lúc lắc khoai tây')).toBeInTheDocument()
    expect(screen.getByText('Dồi sụn nướng than hoa')).toBeInTheDocument()
  })

  it('filters items by availability status and search', () => {
    render(<AdminMenuPage />)

    // Filter "Hết món"
    const outOfStockBtn = screen.getByRole('button', { name: 'Lọc hết món' })
    fireEvent.click(outOfStockBtn)

    expect(screen.getByText('Dồi sụn nướng than hoa')).toBeInTheDocument()
    expect(screen.queryByText('Bò lúc lắc khoai tây')).not.toBeInTheDocument()

    // Search query
    const searchInput = screen.getByPlaceholderText('Tìm tên món ăn, đồ uống...')
    fireEvent.change(searchInput, { target: { value: 'Không tồn tại 123' } })

    expect(screen.getByText('Không tìm thấy món ăn nào phù hợp')).toBeInTheDocument()
  })

  it('toggles item availability and shows notification toast', () => {
    render(<AdminMenuPage />)

    // Find the toggle button for the first item
    const toggleBtns = screen.getAllByTitle('Bấm để chuyển trạng thái Còn/Hết món nhanh')
    fireEvent.click(toggleBtns[0])

    expect(screen.getByText(/Đã chuyển "Bò lúc lắc khoai tây" sang trạng thái: Hết món/)).toBeInTheDocument()
  })
})
