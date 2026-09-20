import { useState, useEffect, useCallback } from 'react'
import type { FC } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth'
import { AdminContext } from './AdminContext'

export const AdminLayout: FC = () => {
  const { adminProfile, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date())
  const [refreshKey, setRefreshKey] = useState<number>(0)
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false)

  const triggerRefresh = useCallback(() => {
    setIsRefreshing(true)
    setRefreshKey((prev) => prev + 1)
    setLastRefreshedAt(new Date())
    setTimeout(() => setIsRefreshing(false), 500)
  }, [])

  // Auto-refresh poll every 15s when document is visible
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        triggerRefresh()
      }
    }, 15000)

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        triggerRefresh()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [triggerRefresh])

  const handleSignOut = async () => {
    await signOut()
    navigate('/admin/login', { state: { manualLogout: true } })
  }

  const navItems = [
    { label: 'Tổng quan (Dashboard)', path: '/admin', exact: true, icon: '📊' },
    { label: 'Hàng đợi đơn hàng', path: '/admin/orders', exact: false, icon: '📋' },
    { label: 'Quản lý đặt bàn', path: '/admin/reservations', exact: false, icon: '📅' },
    { label: 'Quản lý bàn & QR', path: '/admin/tables', exact: false, icon: '🪑' },
    { label: 'Cài đặt & Món ăn', path: '/admin/settings', exact: false, icon: '⚙️' },
  ]

  const isActive = (itemPath: string, exact: boolean) => {
    if (exact) return location.pathname === itemPath
    return location.pathname.startsWith(itemPath)
  }

  return (
    <AdminContext.Provider
      value={{ lastRefreshedAt, refreshKey, triggerRefresh, isRefreshing }}
    >
      <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col md:flex-row font-sans">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-stone-900 border-b border-stone-800">
          <div className="flex items-center space-x-2">
            <span className="text-xl font-bold tracking-wider text-amber-500">TIGER 345</span>
            <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded font-mono font-semibold">ADMIN</span>
          </div>
          <button
            type="button"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 text-stone-300 hover:text-white rounded focus:outline-none focus:ring-2 focus:ring-amber-500"
            aria-label="Toggle menu"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {isSidebarOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </header>

        {/* Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-64 bg-stone-900 border-r border-stone-800 flex flex-col transition-transform duration-200 md:static md:translate-x-0 ${
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {/* Logo / Brand */}
          <div className="p-5 border-b border-stone-800 flex items-center justify-between">
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xl font-black tracking-wider text-amber-400">TIGER 345</span>
                <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded font-mono font-semibold">BẾP & QUÁN</span>
              </div>
              <p className="text-xs text-stone-400 mt-1">Hệ thống Điều phối Vận hành</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 px-3 py-4 space-y-1">
            {navItems.map((item) => {
              const active = isActive(item.path, item.exact)
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsSidebarOpen(false)}
                  className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? 'bg-amber-500 text-stone-950 font-semibold shadow-sm'
                      : 'text-stone-300 hover:bg-stone-800 hover:text-white'
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </nav>

          {/* Admin User Info & Logout */}
          <div className="p-4 border-t border-stone-800 bg-stone-900/60">
            <div className="flex items-center justify-between mb-3">
              <div className="overflow-hidden">
                <p className="text-xs text-stone-400 uppercase tracking-wider font-semibold">Quản trị viên</p>
                <p className="text-sm font-medium text-stone-200 truncate">
                  {adminProfile?.displayName || 'Bếp Trưởng'}
                </p>
              </div>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-950 text-emerald-300 border border-emerald-800/60">
                Online
              </span>
            </div>

            <button
              type="button"
              onClick={handleSignOut}
              className="w-full py-2 px-3 text-xs font-semibold text-stone-300 hover:text-white bg-stone-800 hover:bg-stone-700 rounded transition border border-stone-700/60 flex items-center justify-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>Đăng xuất</span>
            </button>
          </div>
        </aside>

        {/* Backdrop for mobile */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/60 md:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top Status Bar */}
          <div className="bg-stone-900/80 backdrop-blur border-b border-stone-800 px-4 md:px-6 py-2.5 flex items-center justify-between text-xs text-stone-400">
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-stone-300 font-medium">Hệ thống sẵn sàng</span>
              </div>
              <span className="text-stone-600">|</span>
              <span className="hidden sm:inline">
                Cập nhật lúc:{' '}
                <span className="text-stone-200 font-mono">
                  {lastRefreshedAt.toLocaleTimeString('vi-VN')}
                </span>
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={triggerRefresh}
                disabled={isRefreshing}
                className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700/60 transition disabled:opacity-50"
                title="Làm mới dữ liệu ngay (tự động 15s)"
              >
                <svg
                  className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-amber-400' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>{isRefreshing ? 'Đang tải...' : 'Làm mới'}</span>
              </button>
            </div>
          </div>

          {/* Routed Page Content */}
          <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </AdminContext.Provider>
  )
}
