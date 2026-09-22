import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorBoundary } from '@/components/ErrorBoundary'

const ThrowingComponent = ({ message = 'Lỗi render giả lập' }: { message?: string }) => {
  throw new Error(message)
}

const SafeComponent = () => <div>Giao diện bình thường</div>

describe('ErrorBoundary', () => {
  const originalConsoleError = console.error

  beforeEach(() => {
    console.error = vi.fn()
  })

  afterEach(() => {
    console.error = originalConsoleError
  })

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <SafeComponent />
      </ErrorBoundary>
    )

    expect(screen.getByText('Giao diện bình thường')).toBeInTheDocument()
  })

  it('catches render error and displays polished fallback card', () => {
    render(
      <ErrorBoundary fallbackTitle="Sự cố kiểm thử" fallbackMessage="Thông điệp kiểm thử">
        <ThrowingComponent message="Crash test error" />
      </ErrorBoundary>
    )

    expect(screen.getByText('Sự cố kiểm thử')).toBeInTheDocument()
    expect(screen.getByText('Thông điệp kiểm thử')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Thử tải lại/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Về Trang chủ/i })).toBeInTheDocument()
  })

  it('toggles technical details when button is clicked', async () => {
    const user = userEvent.setup()
    render(
      <ErrorBoundary>
        <ThrowingComponent message="Bàn 12 chưa gán mã định danh" />
      </ErrorBoundary>
    )

    const toggleBtn = screen.getByRole('button', { name: /Chi tiết lỗi kỹ thuật/i })
    expect(toggleBtn).toBeInTheDocument()

    // Initially collapsed
    expect(screen.queryByText(/Bàn 12 chưa gán mã định danh/i)).not.toBeInTheDocument()

    // Click to expand
    await user.click(toggleBtn)
    expect(screen.getByText(/Bàn 12 chưa gán mã định danh/i)).toBeInTheDocument()
  })
})
