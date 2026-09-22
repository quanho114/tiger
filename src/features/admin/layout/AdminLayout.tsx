import { useState, useEffect, useCallback, useRef } from 'react'
import type { FC } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  ClipboardList,
  Armchair,
  ReceiptText,
  Utensils,
  BarChart3,
  Users,
  Settings,
  LogOut,
  Search,
  Bell,
  RefreshCw,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  ChevronDown,
} from 'lucide-react'
import { useAuth } from '../../auth'
import { AdminContext } from './AdminContext'
import { ErrorBoundary } from '../../../components/ErrorBoundary'
import '../elera.css'

export const AdminLayout: FC = () => {
  const { adminProfile, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date())
  const [refreshKey, setRefreshKey] = useState<number>(0)
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false)
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false)
  const [searchKeyword, setSearchKeyword] = useState<string>('')
  const [isUserMenuOpen, setIsUserMenuOpen] = useState<boolean>(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsUserMenuOpen(false)
      }
    }
    if (isUserMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isUserMenuOpen])

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

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchKeyword.trim()) return
    navigate(`/admin/orders?q=${encodeURIComponent(searchKeyword.trim())}`)
  }

  const navGroups = [
    {
      group: 'VẬN HÀNH',
      items: [
        { label: 'Tổng quan', path: '/admin', exact: true, icon: LayoutDashboard },
        { label: 'Đơn hàng', path: '/admin/orders', exact: false, icon: ClipboardList, badge: 1 },
        { label: 'Bàn & Đặt chỗ', path: '/admin/tables', exact: false, icon: Armchair, badge: 6 },
        { label: 'Hóa đơn', path: '/admin/invoices', exact: false, icon: ReceiptText },
      ],
    },
    {
      group: 'QUẢN LÝ',
      items: [
        { label: 'Thực đơn', path: '/admin/menu', exact: false, icon: Utensils },
        { label: 'Báo cáo', path: '/admin/reports', exact: false, icon: BarChart3 },
        { label: 'Tài khoản admin', path: '/admin/accounts', exact: false, icon: Users },
      ],
    },
    {
      group: 'HỆ THỐNG',
      items: [
        { label: 'Cài đặt', path: '/admin/settings', exact: false, icon: Settings },
      ],
    },
  ]

  const isActive = (itemPath: string, exact: boolean) => {
    if (exact) return location.pathname === itemPath
    return location.pathname.startsWith(itemPath)
  }

  const initials = adminProfile?.displayName
    ? adminProfile.displayName
        .split(' ')
        .filter(Boolean)
        .slice(-2)
        .map((p) => p[0].toUpperCase())
        .join('')
    : 'NV'

  return (
    <AdminContext.Provider
      value={{ lastRefreshedAt, refreshKey, triggerRefresh, isRefreshing }}
    >
      <div className="admin-elera-scope min-h-screen flex flex-col md:flex-row antialiased selection:bg-[#7cd56e]/30 selection:text-[#121212]">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-[#e2e3e3]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#2b2e2c] flex items-center justify-center text-white font-black text-sm">
              T
            </div>
            <div>
              <span className="text-sm font-bold tracking-tight text-[#171a17]">TIGER 345</span>
              <span className="text-[10px] text-[#787979] block leading-none">Bếp & Quán</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 text-[#787979] hover:text-[#171a17] rounded-lg hover:bg-[#edece9] focus:outline-none transition"
            aria-label="Toggle menu"
          >
            {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </header>

        {/* Sidebar (Elera Collapsible 270px ⇄ 72px) */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 bg-white border-r border-[#e2e3e3] flex flex-col transition-all duration-200 ${
            isCollapsed ? 'w-[72px]' : 'w-[270px]'
          } ${
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
          }`}
        >
          {/* Brand Header */}
          <div className="h-16 px-4 border-b border-[#e2e3e3] flex items-center justify-between shrink-0">
            <Link to="/admin" className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-[#2b2e2c] flex items-center justify-center text-white font-black text-sm shadow-xs shrink-0">
                T
              </div>
              {!isCollapsed && (
                <div className="min-w-0">
                  <h1 className="text-[13.5px] font-bold tracking-tight text-[#171a17] leading-tight truncate">
                    TIGER 345
                  </h1>
                  <p className="text-[10.5px] text-[#787979] font-medium leading-none truncate">
                    Bếp & Quán
                  </p>
                </div>
              )}
            </Link>

            <button
              type="button"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="hidden md:flex p-1.5 text-[#787979] hover:text-[#171a17] hover:bg-[#edece9] rounded-lg transition"
              title={isCollapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'}
            >
              {isCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
          </div>

          {/* Navigation Groups */}
          <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
            {navGroups.map((group, gIdx) => (
              <div key={gIdx} className="space-y-1">
                {!isCollapsed && group.group && (
                  <p className="px-3 text-[10px] font-bold tracking-wider text-[#8a8f89] uppercase mb-1.5">
                    {group.group}
                  </p>
                )}
                {group.items.map((item) => {
                  const active = isActive(item.path, item.exact)
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setIsSidebarOpen(false)}
                      title={isCollapsed ? item.label : undefined}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                        active
                          ? 'bg-[#7cd56e] text-[#0f170e] font-semibold shadow-xs'
                          : 'text-[#5c5e63] hover:bg-[#edece9] hover:text-[#171a17]'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#0f170e]' : 'text-[#787979]'}`} />
                      {!isCollapsed && <span className="truncate">{item.label}</span>}
                      {!isCollapsed && item.badge !== undefined && (
                        <small className="ml-auto px-1.5 py-0.5 rounded bg-[#e2e3e3] text-[#4f534e] text-[10px] font-bold">
                          {item.badge}
                        </small>
                      )}
                    </Link>
                  )
                })}
              </div>
            ))}
          </nav>

          {/* User Profile Footer */}
          <div className="p-3 border-t border-[#e2e3e3] bg-white shrink-0">
            <div className={`flex items-center justify-between p-2 rounded-xl bg-[#f6f5f3] border border-[#e2e3e3] ${isCollapsed ? 'justify-center p-1.5' : ''}`}>
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-[#7cd56e]/20 text-[#24541c] flex items-center justify-center font-bold text-xs shrink-0 border border-[#7cd56e]/40">
                  {initials}
                </div>
                {!isCollapsed && (
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#171a17] truncate">
                      {adminProfile?.displayName || 'Bếp Trưởng'}
                    </p>
                    <p className="text-[10px] text-[#787979] font-medium">
                      Admin chính
                    </p>
                  </div>
                )}
              </div>
              {!isCollapsed && (
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="p-1.5 text-[#787979] hover:text-rose-600 hover:bg-white rounded-lg transition"
                  title="Đăng xuất"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </aside>

        {/* Backdrop for mobile */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/20 backdrop-blur-xs md:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Main Content Area */}
        <div className={`flex-1 flex flex-col min-w-0 transition-all duration-200 ${
          isCollapsed ? 'md:ml-[72px]' : 'md:ml-[270px]'
        }`}>
          {/* Top Bar (Elera Topbar 64px) */}
          <header className="h-16 bg-white border-b border-[#e2e3e3] px-4 md:px-8 flex items-center justify-between sticky top-0 z-20">
            {/* Search Input with Kbd */}
            <form onSubmit={handleSearchSubmit} className="relative w-full max-w-sm">
              <Search className="w-4 h-4 text-[#787979] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="Tìm đơn hàng, bàn, món ăn..."
                className="w-full pl-9 pr-14 py-2 text-xs bg-[#f6f5f3] border border-[#d2d2d2] rounded-xl text-[#171a17] placeholder:text-[#787979] focus:outline-none focus:ring-2 focus:ring-[#7cd56e]/40 focus:border-[#7cd56e] transition"
              />
              <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex items-center px-1.5 py-0.5 rounded border border-[#e2e3e3] bg-white text-[10px] font-medium text-[#787979] font-mono shadow-2xs pointer-events-none">
                ⌘ K
              </kbd>
            </form>

            {/* Right Top Bar Actions */}
            <div className="flex items-center space-x-3 ml-4">
              {/* System status badge */}
              <div className="hidden sm:inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-[#e4f7c6] border border-[#7cd56e]/30 text-[11px] text-[#3e6300] font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-[#7cd56e] animate-pulse" />
                <span>Hệ thống trực tuyến</span>
              </div>

              {/* Manual Refresh Button */}
              <button
                type="button"
                onClick={triggerRefresh}
                disabled={isRefreshing}
                className="elera-icon-btn disabled:opacity-50"
                title={`Cập nhật lúc ${lastRefreshedAt.toLocaleTimeString('vi-VN')}`}
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#7cd56e]' : ''}`} />
              </button>

              {/* Notification Bell */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => navigate('/admin/orders')}
                  className="elera-icon-btn relative"
                  title="Thông báo đơn hàng"
                >
                  <Bell className="w-4 h-4" />
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#7cd56e] text-[#0f170e] rounded-full text-[9px] font-bold flex items-center justify-center ring-2 ring-white">
                    3
                  </span>
                </button>
              </div>

              {/* + Tạo đơn nhanh (Elera new-button style) */}
              <button
                type="button"
                onClick={() => navigate('/admin/orders?action=new')}
                className="elera-btn-primary hidden sm:inline-flex"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tạo đơn</span>
              </button>

              {/* Admin Profile Dropdown */}
              <div className="relative pl-2 border-l border-[#e2e3e3]" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsUserMenuOpen((prev) => !prev)}
                  className="flex items-center space-x-2 py-1 px-1.5 rounded-lg hover:bg-[#f6f5f3] transition cursor-pointer"
                  aria-expanded={isUserMenuOpen}
                  aria-haspopup="true"
                >
                  <div className="w-7 h-7 rounded-full bg-[#7cd56e]/20 text-[#24541c] font-bold text-xs flex items-center justify-center border border-[#7cd56e]/40 shrink-0">
                    {initials}
                  </div>
                  <span className="hidden lg:inline text-xs font-medium text-[#171a17] max-w-[120px] truncate">
                    {adminProfile?.displayName || 'Bếp Trưởng'}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-[#787979] hidden lg:inline" />
                </button>

                {isUserMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 rounded-xl bg-white border border-[#e2e3e3] shadow-lg py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-3.5 py-2 border-b border-[#e2e3e3]">
                      <p className="text-xs font-semibold text-[#171a17] truncate">
                        {adminProfile?.displayName || 'Bếp Trưởng'}
                      </p>
                      <p className="text-[11px] text-[#24541c] font-medium mt-0.5 flex items-center gap-1">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#7cd56e]" />
                        <span>Tài khoản Quản trị</span>
                      </p>
                    </div>

                    <div className="py-1">
                      <Link
                        to="/admin/accounts"
                        onClick={() => setIsUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-[#171a17] hover:bg-[#f6f5f3] transition"
                      >
                        <Users className="w-4 h-4 text-[#787979]" />
                        <span>Tài khoản admin</span>
                      </Link>
                      <Link
                        to="/admin/settings"
                        onClick={() => setIsUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-[#171a17] hover:bg-[#f6f5f3] transition"
                      >
                        <Settings className="w-4 h-4 text-[#787979]" />
                        <span>Cài đặt hệ thống</span>
                      </Link>
                    </div>

                    <div className="my-1 border-t border-[#e2e3e3]" />

                    <button
                      type="button"
                      onClick={() => {
                        setIsUserMenuOpen(false)
                        handleSignOut()
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Đăng xuất</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Routed Page Content */}
          <main className="flex-1 p-4 md:p-6 lg:p-8">
            <ErrorBoundary variant="inline">
              <Outlet />
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </AdminContext.Provider>
  )
}
