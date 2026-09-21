import { useState, type FC } from 'react'
import {
  UserPlus,
  Shield,
  ShieldCheck,
  Lock,
  Unlock,
  Mail,
  Phone,
  X,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import type { AdminAccountItem } from '../types'

const INITIAL_ACCOUNTS: AdminAccountItem[] = [
  {
    id: 'acc-1',
    name: 'Nguyễn Văn A',
    email: 'chutiger@gmail.com',
    phone: '090 123 4567',
    role: 'owner',
    status: 'active',
    last_sign_in_at: new Date(Date.now() - 15 * 60000).toISOString(),
    created_at: '2025-01-10T08:00:00Z',
  },
  {
    id: 'acc-2',
    name: 'Trần Thị B',
    email: 'thungan@gmail.com',
    phone: '091 987 6543',
    role: 'admin',
    status: 'active',
    last_sign_in_at: new Date(Date.now() - 3 * 3600000).toISOString(),
    created_at: '2025-02-15T09:30:00Z',
  },
  {
    id: 'acc-3',
    name: 'Nguyễn Văn C',
    email: 'quanlybep@gmail.com',
    phone: '098 765 4321',
    role: 'admin',
    status: 'active',
    last_sign_in_at: new Date(Date.now() - 26 * 3600000).toISOString(),
    created_at: '2025-03-01T14:00:00Z',
  },
]

export const AdminAccountsPage: FC = () => {
  const [accounts, setAccounts] = useState<AdminAccountItem[]>(INITIAL_ACCOUNTS)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false)

  // New account form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'admin' as 'owner' | 'admin',
  })
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)

  const handleToggleStatus = (id: string) => {
    setAccounts((prev) =>
      prev.map((acc) => {
        if (acc.id === id) {
          if (acc.role === 'owner') {
            alert('Không thể khóa tài khoản Admin chính của chủ quán!')
            return acc
          }
          const nextStatus = acc.status === 'active' ? 'locked' : 'active'
          return { ...acc, status: nextStatus }
        }
        return acc
      })
    )
  }

  const handleToggleRole = (id: string) => {
    setAccounts((prev) =>
      prev.map((acc) => {
        if (acc.id === id) {
          const nextRole = acc.role === 'owner' ? 'admin' : 'owner'
          return { ...acc, role: nextRole }
        }
        return acc
      })
    )
  }

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!formData.name.trim() || !formData.email.trim() || !formData.password.trim()) {
      setFormError('Vui lòng điền đầy đủ Họ tên, Email và Mật khẩu!')
      return
    }

    if (formData.password.length < 6) {
      setFormError('Mật khẩu cần tối thiểu 6 ký tự!')
      return
    }

    const newAcc: AdminAccountItem = {
      id: `acc-${Date.now()}`,
      name: formData.name.trim(),
      email: formData.email.trim(),
      phone: formData.phone.trim() || undefined,
      role: formData.role,
      status: 'active',
      last_sign_in_at: null,
      created_at: new Date().toISOString(),
    }

    setAccounts((prev) => [newAcc, ...prev])
    setFormSuccess('Tạo tài khoản admin thành công!')
    setTimeout(() => {
      setIsCreateModalOpen(false)
      setFormSuccess(null)
      setFormData({ name: '', email: '', phone: '', password: '', role: 'admin' })
    }, 800)
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Tài khoản Quản trị & Nhân sự
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Quản lý tài khoản đăng nhập của gia đình và nhân viên phụ trách ca làm
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsCreateModalOpen(true)}
          className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition shadow-xs self-start sm:self-auto"
        >
          <UserPlus className="w-4 h-4" />
          <span>Thêm tài khoản admin</span>
        </button>
      </div>

      {/* Information Banner */}
      <div className="bg-blue-50/70 border border-blue-200/70 rounded-xl p-4 flex items-start space-x-3 text-xs text-blue-900">
        <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold">Phân quyền đơn giản cho quán gia đình</p>
          <p className="text-blue-700 leading-relaxed text-[11px]">
            • <strong>Admin chính</strong>: Toàn quyền truy cập cài đặt quán, doanh thu báo cáo và phân quyền tài khoản khác.
            <br />
            • <strong>Admin / Thu ngân</strong>: Vận hành gọi món, xử lý bàn, in hóa đơn và cập nhật menu món ăn hàng ngày.
          </p>
        </div>
      </div>

      {/* Accounts Table */}
      <div className="bg-white border border-slate-200/80 rounded-xl shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Danh sách tài khoản ({accounts.length})
            </h2>
            <p className="text-[11px] text-slate-500">
              Các tài khoản có quyền truy cập trang quản trị TIGER 345
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-semibold text-slate-400 uppercase bg-slate-50/50">
                <th className="py-3 px-4 font-medium">Họ và tên</th>
                <th className="py-3 px-4 font-medium">Thông tin liên hệ</th>
                <th className="py-3 px-4 font-medium">Vai trò</th>
                <th className="py-3 px-4 font-medium">Trạng thái</th>
                <th className="py-3 px-4 font-medium">Đăng nhập gần nhất</th>
                <th className="py-3 px-4 font-medium text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {accounts.map((acc) => {
                const isOwner = acc.role === 'owner'
                const isActive = acc.status === 'active'

                return (
                  <tr key={acc.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-3">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                            isOwner ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {acc.name
                            .split(' ')
                            .slice(-2)
                            .map((p) => p[0].toUpperCase())
                            .join('')}
                        </div>
                        <div>
                          <span className="font-semibold text-slate-900 block">{acc.name}</span>
                          <span className="text-[10px] text-slate-400">
                            Tạo ngày {new Date(acc.created_at).toLocaleDateString('vi-VN')}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4 space-y-0.5">
                      <div className="flex items-center space-x-1.5 text-slate-700 font-medium">
                        <Mail className="w-3 h-3 text-slate-400" />
                        <span>{acc.email}</span>
                      </div>
                      {acc.phone && (
                        <div className="flex items-center space-x-1.5 text-slate-400 text-[11px]">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{acc.phone}</span>
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                          isOwner
                            ? 'bg-blue-50 text-blue-700 border border-blue-200/60'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        {isOwner ? <ShieldCheck className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                        <span>{isOwner ? 'Admin chính' : 'Admin'}</span>
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          isActive
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                            : 'bg-rose-50 text-rose-700 border border-rose-200/60'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        <span>{isActive ? 'Đang hoạt động' : 'Tạm khóa'}</span>
                      </span>
                    </td>

                    <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">
                      {acc.last_sign_in_at ? (
                        <span>{new Date(acc.last_sign_in_at).toLocaleString('vi-VN')}</span>
                      ) : (
                        <span className="text-slate-400 italic">Chưa đăng nhập</span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                      {!isOwner && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleToggleRole(acc.id)}
                            className="text-[11px] font-medium text-slate-600 hover:text-blue-600 underline"
                          >
                            Đổi vai trò
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(acc.id)}
                            className={`inline-flex items-center space-x-1 px-2 py-1 rounded border text-[11px] font-medium transition ${
                              isActive
                                ? 'border-slate-200 text-slate-600 hover:text-rose-600 hover:bg-rose-50'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            }`}
                          >
                            {isActive ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                            <span>{isActive ? 'Khóa' : 'Mở khóa'}</span>
                          </button>
                        </>
                      )}
                      {isOwner && (
                        <span className="text-[11px] text-slate-400 italic">Tài khoản chủ</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Create Admin Account */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center space-x-2">
                <UserPlus className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-semibold text-slate-900">Thêm tài khoản admin mới</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center space-x-2 text-xs text-rose-700">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}
              {formSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center space-x-2 text-xs text-emerald-700">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{formSuccess}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Họ và tên <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Nguyễn Văn B"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email đăng nhập <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="thungan2@gmail.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Số điện thoại
                </label>
                <input
                  type="tel"
                  placeholder="09xx xxx xxx"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mật khẩu khởi tạo <span className="text-rose-500">*</span>
                </label>
                <input
                  type="password"
                  required
                  placeholder="Tối thiểu 6 ký tự"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Vai trò quản trị
                </label>
                <div className="grid grid-cols-2 gap-3 mt-1.5">
                  <label
                    className={`p-3 rounded-lg border text-xs cursor-pointer transition ${
                      formData.role === 'admin'
                        ? 'border-blue-600 bg-blue-50/50 text-blue-900 font-semibold'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value="admin"
                      checked={formData.role === 'admin'}
                      onChange={() => setFormData({ ...formData, role: 'admin' })}
                      className="sr-only"
                    />
                    <div className="flex items-center space-x-1.5 mb-1">
                      <Shield className="w-3.5 h-3.5 text-slate-600" />
                      <span>Admin</span>
                    </div>
                    <p className="text-[10px] text-slate-500 font-normal leading-tight">
                      Vận hành ca, xử lý đơn, bàn & in bill
                    </p>
                  </label>

                  <label
                    className={`p-3 rounded-lg border text-xs cursor-pointer transition ${
                      formData.role === 'owner'
                        ? 'border-blue-600 bg-blue-50/50 text-blue-900 font-semibold'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value="owner"
                      checked={formData.role === 'owner'}
                      onChange={() => setFormData({ ...formData, role: 'owner' })}
                      className="sr-only"
                    />
                    <div className="flex items-center space-x-1.5 mb-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                      <span>Admin chính</span>
                    </div>
                    <p className="text-[10px] text-slate-500 font-normal leading-tight">
                      Toàn quyền cấu hình, tài chính & tài khoản
                    </p>
                  </label>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition shadow-xs"
                >
                  Tạo tài khoản
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
