import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  ShoppingBag,
  CalendarCheck,
  MapPin,
  Heart,
  User,
  LogOut,
  ChevronRight,
} from 'lucide-react'
import { useAuth } from '@/features/auth'

export function AccountLayout() {
  const { user, customerProfile, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/', { replace: true })
  }

  const navItems = [
    { to: '/account', label: 'Tổng quan', icon: LayoutDashboard, end: true },
    { to: '/account/orders', label: 'Đơn hàng', icon: ShoppingBag, end: false },
    { to: '/account/reservations', label: 'Đặt bàn', icon: CalendarCheck, end: false },
    { to: '/account/addresses', label: 'Sổ địa chỉ', icon: MapPin, end: false },
    { to: '/account/favorites', label: 'Yêu thích', icon: Heart, end: false },
    { to: '/account/profile', label: 'Hồ sơ', icon: User, end: false },
  ]

  const displayName =
    customerProfile?.displayName ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split('@')[0] ||
    'Quý khách'

  return (
    <div className="min-h-screen bg-[#fbf9f6] text-slate-800 pt-14 md:pt-32 pb-6 md:pb-16">
      {/* Account Hero Bar */}
      <div className="bg-white border-b border-[#234386]/10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-full bg-[#234386] text-white flex items-center justify-center font-bold text-lg shadow-sm">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                  {displayName}
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 font-medium">
                  {user?.email || customerProfile?.phone || 'Thành viên Tiger 345'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-red-600 hover:border-red-200 hover:bg-red-50 text-xs font-semibold transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Đăng xuất</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Side Navigation (Desktop) & Top Tabs (Mobile) */}
          <aside className="md:col-span-1">
            <div className="bg-white rounded-xl p-2 sm:p-3 border border-[#234386]/10">
              <nav className="flex flex-col gap-0.5">
                {navItems.map((item) => {
                  const Icon = item.icon
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      className={({ isActive }) =>
                        `flex items-center justify-between min-h-12 px-3.5 py-3 rounded-lg text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-[#234386]/6 text-[#234386] font-semibold'
                            : 'text-slate-600 hover:bg-[#234386]/4 hover:text-[#234386]'
                        }`
                      }
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className="w-4 h-4 shrink-0" />
                        <span>{item.label}</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                    </NavLink>
                  )
                })}
              </nav>
            </div>
          </aside>

          {/* Account Sub-page Outlet */}
          <main className="md:col-span-3">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
