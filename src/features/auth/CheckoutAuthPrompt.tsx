import type { FC } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { UserCheck, Sparkles } from 'lucide-react'
import { useAuth } from './useAuth'

export const CheckoutAuthPrompt: FC = () => {
  const { role, user, customerProfile } = useAuth()
  const location = useLocation()

  const currentPath = location.pathname + location.search
  const loginUrl = `/login?returnTo=${encodeURIComponent(currentPath || '/menu')}`

  if (role === 'customer' && user) {
    const displayName = customerProfile?.displayName || user.email || 'Khách hàng thân thiết'

    return (
      <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/60 text-xs text-emerald-900 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <UserCheck size={16} className="text-emerald-600 shrink-0" />
          <div className="truncate">
            <span className="font-semibold block truncate">Đặt món với: {displayName}</span>
            <span className="text-[11px] text-emerald-700/80">
              Đơn hàng sẽ được tự động lưu vào tài khoản
            </span>
          </div>
        </div>
        <Link
          to="/account"
          className="shrink-0 text-[11px] font-semibold text-[#234386] hover:underline whitespace-nowrap px-2 py-1 bg-white rounded-lg border border-emerald-200 shadow-2xs"
        >
          Tài khoản
        </Link>
      </div>
    )
  }

  // Guest: Optional login reminder without blocking guest flow
  return (
    <div className="p-3 rounded-xl bg-[#234386]/5 border border-[#234386]/15 text-xs text-[#234386] flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <Sparkles size={15} className="text-[#ed7328] shrink-0" />
        <span className="text-black/75 truncate">
          <strong className="text-[#234386] font-semibold">Đăng nhập</strong> để lưu địa chỉ và
          lịch sử đơn hàng
        </span>
      </div>
      <Link
        to={loginUrl}
        className="shrink-0 text-[11px] font-semibold text-[#234386] hover:text-[#ed7328] hover:underline whitespace-nowrap px-2.5 py-1 bg-white rounded-lg border border-[#d2b68c]/60 shadow-2xs transition"
      >
        Đăng nhập
      </Link>
    </div>
  )
}
