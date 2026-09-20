import { useEffect, useState } from 'react'
import {
  User,
  Phone,
  Mail,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Bell,
  Shield,
  Trash2,
  AlertTriangle,
  X,
} from 'lucide-react'
import { fetchCustomerProfile, updateCustomerProfile, requestDeleteAccount } from './api'
import type { CustomerProfile } from './types'
import { useAuth } from '@/features/auth/useAuth'
import { ApiError } from '@/lib/api/types'

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function AccountProfilePage() {
  const { user, signOut } = useAuth()
  const [profile, setProfile] = useState<CustomerProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [displayName, setDisplayName] = useState('')
  const [phone, setPhone] = useState('')
  const [marketingOptIn, setMarketingOptIn] = useState(false)

  const [isSaving, setIsSaving] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Account deletion modal state (Invariant V23)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function handleConfirmDelete() {
    const trimmed = deleteConfirmText.trim()
    if (trimmed.toUpperCase() !== 'XÓA TÀI KHOẢN' && trimmed.toUpperCase() !== 'DELETE') {
      setDeleteError('Vui lòng nhập chính xác cụm từ "XÓA TÀI KHOẢN" để xác nhận.')
      return
    }

    try {
      setIsDeleting(true)
      setDeleteError(null)
      await requestDeleteAccount(trimmed)
      window.location.href = '/'
      await signOut()
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.code === 'AUTH_RECENT_REQUIRED' || err.status === 401) {
          setDeleteError(
            'Phiên đăng nhập đã quá 10 phút vì lý do bảo mật. Vui lòng đăng xuất và đăng nhập lại trước khi thực hiện thao tác xóa vĩnh viễn.'
          )
        } else if (err.code === 'ACTIVE_ADMIN_SELF_DELETE_FORBIDDEN' || err.status === 403) {
          setDeleteError(
            'Tài khoản quản trị viên không thể tự xóa qua cổng khách hàng. Vui lòng liên hệ ban quản trị hệ thống.'
          )
        } else {
          setDeleteError(err.message || 'Không thể xóa tài khoản lúc này. Vui lòng thử lại sau.')
        }
      } else if (err instanceof Error) {
        setDeleteError(err.message)
      } else {
        setDeleteError('Đã xảy ra lỗi không xác định khi yêu cầu xóa tài khoản.')
      }
    } finally {
      setIsDeleting(false)
    }
  }

  useEffect(() => {
    let isMounted = true
    async function load() {
      try {
        setIsLoading(true)
        setError(null)
        const data = await fetchCustomerProfile()
        if (isMounted) {
          setProfile(data)
          setDisplayName(data.display_name || '')
          setPhone(data.phone || '')
          setMarketingOptIn(data.marketing_opt_in)
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Không thể tải thông tin hồ sơ')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    load()
    return () => {
      isMounted = false
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setIsSaving(true)
      setSaveError(null)
      setSuccessMessage(null)

      const updated = await updateCustomerProfile({
        display_name: displayName.trim() || undefined,
        phone: phone.trim() || null,
        marketing_opt_in: marketingOptIn,
      })

      setProfile(updated)
      setDisplayName(updated.display_name || '')
      setPhone(updated.phone || '')
      setMarketingOptIn(updated.marketing_opt_in)
      setSuccessMessage('Cập nhật thông tin cá nhân thành công!')
      setTimeout(() => setSuccessMessage(null), 4000)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Không thể cập nhật hồ sơ')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 border border-amber-100 shadow-xs space-y-8">
      <div className="pb-4 border-b border-slate-100">
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
          <User className="w-5 h-5 text-amber-600" />
          <span>Thông tin tài khoản</span>
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Quản lý thông tin cá nhân, số điện thoại liên hệ và tùy chọn thông báo ưu đãi
        </p>
      </div>

      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-amber-500 mb-3" />
          <p className="text-sm font-medium">Đang tải hồ sơ...</p>
        </div>
      ) : error ? (
        <div className="py-10 text-center text-red-600">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-80" />
          <p className="text-sm font-semibold">{error}</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6 max-w-xl">
          {successMessage && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {saveError && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}

          <div className="space-y-4 text-xs">
            {/* Email (Read only) */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                <span>Địa chỉ Email</span>
              </label>
              <input
                type="email"
                disabled
                value={user?.email || ''}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 cursor-not-allowed font-medium"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Email đăng nhập liên kết với tài khoản của bạn
              </p>
            </div>

            {/* Display Name */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span>Họ và tên / Tên hiển thị</span>
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="VD: Nguyễn Văn A"
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-slate-800 font-medium"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <span>Số điện thoại liên hệ</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="VD: 090 123 4567"
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-slate-800 font-medium"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Được dùng để liên hệ giao hàng và xác nhận đặt bàn
              </p>
            </div>

            {/* Account Created At */}
            {profile?.created_at && (
              <div className="pt-1">
                <p className="text-slate-500 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>Ngày tham gia: {formatDate(profile.created_at)}</span>
                </p>
              </div>
            )}

            {/* Marketing Opt-in */}
            <div className="pt-3 border-t border-slate-100">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={marketingOptIn}
                  onChange={(e) => setMarketingOptIn(e.target.checked)}
                  className="rounded text-amber-500 focus:ring-amber-400 mt-0.5"
                />
                <div>
                  <span className="font-bold text-slate-800 block flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5 text-amber-600" />
                    <span>Nhận thông báo ưu đãi & sự kiện mới</span>
                  </span>
                  <span className="text-[11px] text-slate-500 block mt-0.5">
                    Nhận tin tức về các món ăn mới, chương trình giảm giá và quà tặng sinh nhật từ Quán nhậu Tiger 345
                  </span>
                </div>
              </label>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>Lưu thay đổi</span>
            </button>
          </div>
        </form>
      )}

      {/* Privacy & Account Deletion (Invariant V23 / T19) */}
      <div className="pt-6 border-t border-slate-200/80 max-w-xl">
        <div className="flex items-center gap-2 text-slate-700 font-bold text-sm mb-2">
          <Shield className="w-4 h-4 text-slate-500" />
          <span>Bảo mật & Quyền riêng tư</span>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          Thông tin cá nhân của bạn được bảo mật tuyệt đối theo chính sách bảo mật của Tiger 345.
          Dữ liệu lịch sử đơn hàng và đặt bàn chỉ thuộc về riêng bạn và không bao giờ được chia sẻ với bên thứ ba.
        </p>

        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
          <div>
            <p className="font-semibold text-slate-700">Yêu cầu xóa tài khoản</p>
            <p className="text-[11px] text-slate-400">
              Xóa dữ liệu cá nhân vĩnh viễn và ẩn danh hóa lịch sử giao dịch theo Invariant V23
            </p>
          </div>

          <button
            type="button"
            data-testid="open-delete-account-btn"
            onClick={() => {
              setIsDeleteModalOpen(true)
              setDeleteError(null)
              setDeleteConfirmText('')
            }}
            className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Yêu cầu xóa</span>
          </button>
        </div>
      </div>

      {/* Confirmation Modal for Account Deletion (Invariant V23) */}
      {isDeleteModalOpen && (
        <div
          data-testid="delete-account-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 relative animate-in fade-in zoom-in-95 duration-150">
            <button
              type="button"
              data-testid="cancel-delete-btn"
              onClick={() => {
                if (!isDeleting) {
                  setIsDeleteModalOpen(false)
                  setDeleteError(null)
                }
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors p-1"
              aria-label="Đóng hộp thoại"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 text-red-600 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Xác nhận xóa tài khoản</h3>
                <p className="text-xs text-red-600 font-medium">Hành động này không thể hoàn tác</p>
              </div>
            </div>

            <div className="text-xs text-slate-600 space-y-2.5 my-4 bg-slate-50 p-3.5 rounded-xl border border-slate-200/60 leading-relaxed">
              <p>
                Khi xác nhận xóa tài khoản, hệ thống Tiger 345 sẽ:
              </p>
              <ul className="list-disc pl-4 space-y-1 text-slate-600">
                <li>Xóa toàn bộ hồ sơ cá nhân, địa chỉ giao hàng và món ăn yêu thích.</li>
                <li>Hủy kích hoạt và khóa hoàn toàn quyền truy cập của tài khoản ngay lập tức.</li>
                <li>Tách và ẩn danh hóa thông tin cá nhân trên lịch sử đơn hàng và đặt bàn nhằm bảo toàn báo cáo tài chính nhà hàng.</li>
              </ul>
            </div>

            {deleteError && (
              <div
                data-testid="delete-error-banner"
                className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-start gap-2"
              >
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <span className="leading-tight">{deleteError}</span>
              </div>
            )}

            <div className="mb-4">
              <label htmlFor="delete-confirmation-input" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Nhập cụm từ <span className="font-mono text-red-600 font-bold select-all">XÓA TÀI KHOẢN</span> để xác nhận:
              </label>
              <input
                id="delete-confirmation-input"
                data-testid="delete-confirm-input"
                type="text"
                disabled={isDeleting}
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="XÓA TÀI KHOẢN"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-red-400 disabled:bg-slate-100"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
              >
                Hủy bỏ
              </button>

              <button
                type="button"
                data-testid="confirm-delete-btn"
                disabled={
                  isDeleting ||
                  (deleteConfirmText.trim().toUpperCase() !== 'XÓA TÀI KHOẢN' &&
                    deleteConfirmText.trim().toUpperCase() !== 'DELETE')
                }
                onClick={handleConfirmDelete}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang xử lý...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xác nhận xóa vĩnh viễn</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
