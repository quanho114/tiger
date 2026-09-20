import { useEffect, useState } from 'react'
import {
  MapPin,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Phone,
  User,
  Home,
  Briefcase,
  Star,
} from 'lucide-react'
import {
  fetchCustomerAddresses,
  createCustomerAddress,
  updateCustomerAddress,
  deleteCustomerAddress,
} from './api'
import type { CustomerAddress, CustomerAddressCreate } from './types'

export function AccountAddressesPage() {
  const [addresses, setAddresses] = useState<CustomerAddress[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingAddress, setEditingAddress] = useState<CustomerAddress | null>(null)
  const [formData, setFormData] = useState<CustomerAddressCreate>({
    label: 'Nhà riêng',
    recipient_name: '',
    phone: '',
    address_line: '',
    ward: '',
    district: '',
    province: 'Đồng Nai',
    delivery_note: '',
    is_default: false,
  })
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Delete State
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  async function load() {
    try {
      setIsLoading(true)
      setError(null)
      const data = await fetchCustomerAddresses()
      setAddresses(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải sổ địa chỉ')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleOpenAdd = () => {
    setEditingAddress(null)
    setFormData({
      label: 'Nhà riêng',
      recipient_name: '',
      phone: '',
      address_line: '',
      ward: '',
      district: '',
      province: 'Đồng Nai',
      delivery_note: '',
      is_default: addresses.length === 0,
    })
    setFormError(null)
    setIsModalOpen(true)
  }

  const handleOpenEdit = (addr: CustomerAddress) => {
    setEditingAddress(addr)
    setFormData({
      label: addr.label,
      recipient_name: addr.recipient_name,
      phone: addr.phone,
      address_line: addr.address_line,
      ward: addr.ward || '',
      district: addr.district || '',
      province: addr.province || 'Đồng Nai',
      delivery_note: addr.delivery_note || '',
      is_default: addr.is_default,
    })
    setFormError(null)
    setIsModalOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.recipient_name.trim() || !formData.phone.trim() || !formData.address_line.trim()) {
      setFormError('Vui lòng điền đầy đủ Tên người nhận, Số điện thoại và Địa chỉ chi tiết')
      return
    }

    try {
      setIsSubmitting(true)
      setFormError(null)

      if (editingAddress) {
        await updateCustomerAddress(editingAddress.id, {
          expected_version: editingAddress.version,
          label: formData.label,
          recipient_name: formData.recipient_name.trim(),
          phone: formData.phone.trim(),
          address_line: formData.address_line.trim(),
          ward: formData.ward?.trim() || null,
          district: formData.district?.trim() || null,
          province: formData.province?.trim() || null,
          delivery_note: formData.delivery_note?.trim() || '',
          is_default: formData.is_default,
        })
      } else {
        await createCustomerAddress({
          label: formData.label,
          recipient_name: formData.recipient_name.trim(),
          phone: formData.phone.trim(),
          address_line: formData.address_line.trim(),
          ward: formData.ward?.trim() || null,
          district: formData.district?.trim() || null,
          province: formData.province?.trim() || null,
          delivery_note: formData.delivery_note?.trim() || '',
          is_default: formData.is_default,
        })
      }

      setIsModalOpen(false)
      await load()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Không thể lưu địa chỉ')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa địa chỉ này?')) return

    try {
      setIsDeleting(true)
      setDeletingId(id)
      await deleteCustomerAddress(id)
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Không thể xóa địa chỉ')
    } finally {
      setIsDeleting(false)
      setDeletingId(null)
    }
  }

  const handleSetDefault = async (addr: CustomerAddress) => {
    try {
      await updateCustomerAddress(addr.id, {
        expected_version: addr.version,
        is_default: true,
      })
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Không thể đặt làm địa chỉ mặc định')
    }
  }

  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 border border-amber-100 shadow-xs space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-amber-600" />
            <span>Sổ địa chỉ giao hàng</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Lưu trước các địa chỉ giao hàng để đặt món nhanh chóng chỉ với một chạm
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-xs transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Thêm địa chỉ mới</span>
        </button>
      </div>

      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-amber-500 mb-3" />
          <p className="text-sm font-medium">Đang tải sổ địa chỉ...</p>
        </div>
      ) : error ? (
        <div className="py-10 text-center text-red-600">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-80" />
          <p className="text-sm font-semibold">{error}</p>
        </div>
      ) : addresses.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <MapPin className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-base font-bold text-slate-700">Chưa có địa chỉ nào được lưu</p>
          <p className="text-xs text-slate-400 mt-1">
            Lưu địa chỉ nhà riêng hoặc nơi làm việc để thanh toán giao hàng thuận tiện
          </p>
          <button
            type="button"
            onClick={handleOpenAdd}
            className="inline-block mt-4 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
          >
            Thêm địa chỉ đầu tiên
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {addresses.map((addr) => (
            <div
              key={addr.id}
              className={`p-4 rounded-2xl border transition-all relative flex flex-col justify-between ${
                addr.is_default
                  ? 'border-amber-400 bg-amber-50/20 shadow-xs'
                  : 'border-slate-200 bg-white hover:border-amber-200'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800 bg-slate-100 px-2.5 py-0.5 rounded-md flex items-center gap-1">
                      {addr.label === 'Nhà riêng' ? (
                        <Home className="w-3 h-3 text-amber-600" />
                      ) : (
                        <Briefcase className="w-3 h-3 text-blue-600" />
                      )}
                      <span>{addr.label}</span>
                    </span>

                    {addr.is_default && (
                      <span className="text-[11px] font-bold text-amber-700 bg-amber-100/90 border border-amber-300/80 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Mặc định</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(addr)}
                      className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                      title="Chỉnh sửa"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={isDeleting && deletingId === addr.id}
                      onClick={() => handleDelete(addr.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Xóa"
                    >
                      {isDeleting && deletingId === addr.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-1 text-xs text-slate-700">
                  <p className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    <span>{addr.recipient_name}</span>
                  </p>
                  <p className="flex items-center gap-1.5 text-slate-600">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>{addr.phone}</span>
                  </p>
                  <p className="flex items-start gap-1.5 pt-1 text-slate-800 font-medium">
                    <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      {addr.address_line}
                      {addr.ward ? `, ${addr.ward}` : ''}
                      {addr.district ? `, ${addr.district}` : ''}
                      {addr.province ? `, ${addr.province}` : ''}
                    </span>
                  </p>
                  {addr.delivery_note && (
                    <p className="text-slate-400 italic pt-1 pl-5">
                      Ghi chú: {addr.delivery_note}
                    </p>
                  )}
                </div>
              </div>

              {!addr.is_default && (
                <div className="pt-3 mt-3 border-t border-slate-100 flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleSetDefault(addr)}
                    className="text-[11px] font-semibold text-amber-600 hover:text-amber-700 hover:underline flex items-center gap-1"
                  >
                    <Star className="w-3 h-3" />
                    <span>Đặt làm mặc định</span>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Address Form Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 border border-slate-200 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-bold text-slate-900">
                {editingAddress ? 'Chỉnh sửa địa chỉ' : 'Thêm địa chỉ nhận hàng'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                {formError}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Loại địa chỉ</label>
                <div className="flex items-center gap-2">
                  {['Nhà riêng', 'Công ty', 'Khác'].map((lbl) => (
                    <button
                      key={lbl}
                      type="button"
                      onClick={() => setFormData({ ...formData, label: lbl })}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                        formData.label === lbl
                          ? 'border-amber-500 bg-amber-50 text-amber-800'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Tên người nhận <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.recipient_name}
                    onChange={(e) => setFormData({ ...formData, recipient_name: e.target.value })}
                    placeholder="VD: Nguyễn Văn A"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Số điện thoại <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="VD: 090 123 4567"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Địa chỉ chi tiết (Số nhà, tên đường) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.address_line}
                  onChange={(e) => setFormData({ ...formData, address_line: e.target.value })}
                  placeholder="VD: 17 Đường Số 1, Khu phố 3"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Phường / Xã</label>
                  <input
                    type="text"
                    value={formData.ward || ''}
                    onChange={(e) => setFormData({ ...formData, ward: e.target.value })}
                    placeholder="VD: Vĩnh An"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Quận / Huyện</label>
                  <input
                    type="text"
                    value={formData.district || ''}
                    onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                    placeholder="VD: Vĩnh Cửu"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tỉnh / Thành</label>
                  <input
                    type="text"
                    value={formData.province || 'Đồng Nai'}
                    onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                    placeholder="VD: Đồng Nai"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Chỉ dẫn giao hàng (Tùy chọn)
                </label>
                <input
                  type="text"
                  value={formData.delivery_note || ''}
                  onChange={(e) => setFormData({ ...formData, delivery_note: e.target.value })}
                  placeholder="VD: Cổng màu xanh, đối diện tiệm thuốc..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_default}
                    onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                    className="rounded text-amber-500 focus:ring-amber-400"
                  />
                  <span className="font-semibold text-slate-700">
                    Đặt làm địa chỉ giao hàng mặc định
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold shadow-xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editingAddress ? 'Lưu cập nhật' : 'Thêm địa chỉ'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
