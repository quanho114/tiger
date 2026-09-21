import { useState, type FC, type FormEvent } from 'react'
import { Building2, Truck, Plus, Edit2, Trash2, X, Check } from 'lucide-react'
import { adminApi } from '../../../lib/api/client'
import { ApiError } from '../../../lib/api/types'
import type { AdminSeatingArea, AdminDeliveryZone } from '../types'

interface AreasZonesSectionProps {
  seatingAreas: AdminSeatingArea[]
  deliveryZones: AdminDeliveryZone[]
  onReload: () => Promise<void>
  onNotify: (text: string, type: 'success' | 'error') => void
}

export const AreasZonesSection: FC<AreasZonesSectionProps> = ({
  seatingAreas,
  deliveryZones,
  onReload,
  onNotify,
}) => {
  // Seating Area State
  const [isCreateAreaOpen, setIsCreateAreaOpen] = useState<boolean>(false)
  const [editingArea, setEditingArea] = useState<AdminSeatingArea | null>(null)
  const [areaCode, setAreaCode] = useState<string>('')
  const [areaName, setAreaName] = useState<string>('')
  const [areaSortOrder, setAreaSortOrder] = useState<number>(0)
  const [areaActive, setAreaActive] = useState<boolean>(true)
  const [isSubmittingArea, setIsSubmittingArea] = useState<boolean>(false)

  // Delivery Zone State
  const [isCreateZoneOpen, setIsCreateZoneOpen] = useState<boolean>(false)
  const [editingZone, setEditingZone] = useState<AdminDeliveryZone | null>(null)
  const [zoneName, setZoneName] = useState<string>('')
  const [zoneDescription, setZoneDescription] = useState<string>('')
  const [zoneFeeVnd, setZoneFeeVnd] = useState<number>(15000)
  const [zoneFreeThresholdVnd, setZoneFreeThresholdVnd] = useState<number | null>(300000)
  const [zoneSortOrder, setZoneSortOrder] = useState<number>(0)
  const [zoneActive, setZoneActive] = useState<boolean>(true)
  const [isSubmittingZone, setIsSubmittingZone] = useState<boolean>(false)

  // --------------------------------------------------------------------------
  // Seating Areas Handlers
  // --------------------------------------------------------------------------
  const handleOpenCreateArea = () => {
    setEditingArea(null)
    setAreaCode('')
    setAreaName('')
    setAreaSortOrder(seatingAreas.length + 1)
    setAreaActive(true)
    setIsCreateAreaOpen(true)
  }

  const handleOpenEditArea = (area: AdminSeatingArea) => {
    setEditingArea(area)
    setAreaCode(area.code)
    setAreaName(area.name)
    setAreaSortOrder(area.sort_order)
    setAreaActive(area.active)
  }

  const handleSaveArea = async (e: FormEvent) => {
    e.preventDefault()
    if (!areaCode.trim() || !areaName.trim()) {
      alert('Vui lòng nhập mã và tên khu vực bàn')
      return
    }

    setIsSubmittingArea(true)
    try {
      if (editingArea) {
        await adminApi.patch(`/seating-areas/${editingArea.id}`, {
          code: areaCode.trim(),
          name: areaName.trim(),
          sort_order: Number(areaSortOrder),
          active: areaActive,
          expected_version: editingArea.version,
        })
        setEditingArea(null)
        onNotify(`Cập nhật khu vực "${areaName}" thành công!`, 'success')
      } else {
        await adminApi.post('/seating-areas', {
          code: areaCode.trim(),
          name: areaName.trim(),
          sort_order: Number(areaSortOrder),
          active: areaActive,
        })
        setIsCreateAreaOpen(false)
        onNotify(`Tạo khu vực bàn "${areaName}" thành công!`, 'success')
      }
      await onReload()
    } catch (err: unknown) {
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') {
        onNotify('Xung đột phiên bản khu vực. Đang tải lại...', 'error')
        await onReload()
      } else {
        onNotify(err instanceof Error ? err.message : 'Lỗi khi lưu khu vực bàn', 'error')
      }
    } finally {
      setIsSubmittingArea(false)
    }
  }

  const handleDeleteArea = async (area: AdminSeatingArea) => {
    if (!confirm(`Xác nhận xóa/lưu trữ khu vực bàn "${area.name}"?`)) return
    try {
      await adminApi.delete(`/seating-areas/${area.id}`)
      onNotify('Đã xử lý xóa khu vực bàn.', 'success')
      await onReload()
    } catch (err: unknown) {
      onNotify(err instanceof Error ? err.message : 'Lỗi khi xóa khu vực bàn', 'error')
    }
  }

  // --------------------------------------------------------------------------
  // Delivery Zones Handlers
  // --------------------------------------------------------------------------
  const handleOpenCreateZone = () => {
    setEditingZone(null)
    setZoneName('')
    setZoneDescription('')
    setZoneFeeVnd(15000)
    setZoneFreeThresholdVnd(300000)
    setZoneSortOrder(deliveryZones.length + 1)
    setZoneActive(true)
    setIsCreateZoneOpen(true)
  }

  const handleOpenEditZone = (zone: AdminDeliveryZone) => {
    setEditingZone(zone)
    setZoneName(zone.name)
    setZoneDescription(zone.description || '')
    setZoneFeeVnd(zone.fee_vnd)
    setZoneFreeThresholdVnd(zone.free_threshold_vnd)
    setZoneSortOrder(zone.sort_order)
    setZoneActive(zone.active)
  }

  const handleSaveZone = async (e: FormEvent) => {
    e.preventDefault()
    if (!zoneName.trim()) {
      alert('Vui lòng nhập tên khu vực giao hàng')
      return
    }

    setIsSubmittingZone(true)
    try {
      const payload = {
        name: zoneName.trim(),
        description: zoneDescription.trim() || null,
        fee_vnd: Number(zoneFeeVnd),
        free_threshold_vnd: zoneFreeThresholdVnd ? Number(zoneFreeThresholdVnd) : null,
        sort_order: Number(zoneSortOrder),
        active: zoneActive,
      }

      if (editingZone) {
        await adminApi.patch(`/delivery-zones/${editingZone.id}`, {
          ...payload,
          expected_version: editingZone.version,
        })
        setEditingZone(null)
        onNotify(`Cập nhật khu vực ship "${zoneName}" thành công!`, 'success')
      } else {
        await adminApi.post('/delivery-zones', payload)
        setIsCreateZoneOpen(false)
        onNotify(`Tạo khu vực ship "${zoneName}" thành công!`, 'success')
      }
      await onReload()
    } catch (err: unknown) {
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') {
        onNotify('Xung đột phiên bản khu vực giao hàng. Đang tải lại...', 'error')
        await onReload()
      } else {
        onNotify(err instanceof Error ? err.message : 'Lỗi khi lưu khu vực ship', 'error')
      }
    } finally {
      setIsSubmittingZone(false)
    }
  }

  const handleDeleteZone = async (zone: AdminDeliveryZone) => {
    if (!confirm(`Xác nhận xóa/lưu trữ khu vực giao hàng "${zone.name}"?`)) return
    try {
      await adminApi.delete(`/delivery-zones/${zone.id}`)
      onNotify('Đã xử lý xóa khu vực giao hàng.', 'success')
      await onReload()
    } catch (err: unknown) {
      onNotify(err instanceof Error ? err.message : 'Lỗi khi xóa khu vực giao hàng', 'error')
    }
  }

  return (
    <div className="space-y-6">
      {/* Seating Areas Section */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200/60 flex items-center justify-center text-blue-600">
                <Building2 className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-bold text-slate-900">
                Khu Vực Bàn & Không Gian Quán
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Phân chia không gian bàn ăn (Trong nhà, Sân thượng, Ngoài trời, Phòng VIP)
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenCreateArea}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-2xs transition flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Thêm Khu Vực</span>
          </button>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500 bg-slate-50 border-b border-slate-200 font-semibold">
              <tr>
                <th className="py-2.5 px-3">Mã khu vực</th>
                <th className="py-2.5 px-3">Tên khu vực</th>
                <th className="py-2.5 px-3">Thứ tự</th>
                <th className="py-2.5 px-3">Trạng thái</th>
                <th className="py-2.5 px-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {seatingAreas.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    Chưa có khu vực bàn nào được tạo
                  </td>
                </tr>
              ) : (
                seatingAreas.map((area) => (
                  <tr key={area.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-2.5 px-3 font-mono font-bold text-blue-600">{area.code}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900">{area.name}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-400">{area.sort_order}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                          area.active
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-slate-100 text-slate-500 border-slate-200'
                        }`}
                      >
                        {area.active ? 'Hoạt động' : 'Tạm khóa'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => handleOpenEditArea(area)}
                        className="p-1 text-slate-500 hover:text-blue-600 rounded transition inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Sửa</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteArea(area)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded transition inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Xóa</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delivery Zones Section */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200/60 flex items-center justify-center text-blue-600">
                <Truck className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-bold text-slate-900">
                Khu Vực Giao Hàng & Phí Ship
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Cấu hình phạm vi bán kính, phí vận chuyển và ngưỡng miễn phí ship
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenCreateZone}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-2xs transition flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Thêm Khu Vực Ship</span>
          </button>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500 bg-slate-50 border-b border-slate-200 font-semibold">
              <tr>
                <th className="py-2.5 px-3">Khu vực ship</th>
                <th className="py-2.5 px-3">Phí giao hàng</th>
                <th className="py-2.5 px-3">Miễn phí ship từ</th>
                <th className="py-2.5 px-3">Mô tả phạm vi</th>
                <th className="py-2.5 px-3">Trạng thái</th>
                <th className="py-2.5 px-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {deliveryZones.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Chưa có khu vực giao hàng nào được cấu hình
                  </td>
                </tr>
              ) : (
                deliveryZones.map((zone) => (
                  <tr key={zone.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-2.5 px-3 font-semibold text-slate-900">{zone.name}</td>
                    <td className="py-2.5 px-3 font-mono font-bold text-blue-600">
                      {zone.fee_vnd.toLocaleString('vi-VN')}đ
                    </td>
                    <td className="py-2.5 px-3 font-mono text-emerald-600 font-medium">
                      {zone.free_threshold_vnd
                        ? `${zone.free_threshold_vnd.toLocaleString('vi-VN')}đ`
                        : 'Không hỗ trợ'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 text-[11px]">{zone.description || '—'}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                          zone.active
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-slate-100 text-slate-500 border-slate-200'
                        }`}
                      >
                        {zone.active ? 'Hoạt động' : 'Tạm dừng'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => handleOpenEditZone(zone)}
                        className="p-1 text-slate-500 hover:text-blue-600 rounded transition inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Sửa</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteZone(zone)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded transition inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Xóa</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Seating Area Create / Edit */}
      {(isCreateAreaOpen || editingArea) && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-md shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">
                {editingArea ? `Sửa Khu Vực: ${editingArea.name}` : 'Thêm Khu Vực Bàn Mới'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsCreateAreaOpen(false)
                  setEditingArea(null)
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveArea} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Mã khu vực (Code) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="VD: INDOOR, OUTDOOR, ROOFTOP, VIP"
                  value={areaCode}
                  onChange={(e) => setAreaCode(e.target.value.toUpperCase())}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Tên hiển thị khu vực <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="VD: Sảnh Tầng 1, Sân Thượng Thoáng Mát"
                  value={areaName}
                  onChange={(e) => setAreaName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Thứ tự hiển thị
                </label>
                <input
                  type="number"
                  value={areaSortOrder}
                  onChange={(e) => setAreaSortOrder(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="areaActiveCheck"
                  checked={areaActive}
                  onChange={(e) => setAreaActive(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <label htmlFor="areaActiveCheck" className="font-medium text-slate-700">
                  Khu vực đang mở cửa tiếp khách
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateAreaOpen(false)
                    setEditingArea(null)
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingArea}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition flex items-center gap-1.5 shadow-2xs"
                >
                  {isSubmittingArea ? (
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Lưu Khu Vực</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Delivery Zone Create / Edit */}
      {(isCreateZoneOpen || editingZone) && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-md shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">
                {editingZone ? `Sửa Vùng Giao: ${editingZone.name}` : 'Thêm Khu Vực Giao Hàng Mới'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsCreateZoneOpen(false)
                  setEditingZone(null)
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveZone} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Tên khu vực ship <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="VD: Nội thành (< 3km), Ngoại ô (3-7km)"
                  value={zoneName}
                  onChange={(e) => setZoneName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Phí giao hàng (VNĐ) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    required
                    value={zoneFeeVnd}
                    onChange={(e) => setZoneFeeVnd(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Miễn ship từ (VNĐ)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={10000}
                    placeholder="Không miễn phí"
                    value={zoneFreeThresholdVnd ?? ''}
                    onChange={(e) =>
                      setZoneFreeThresholdVnd(e.target.value ? Number(e.target.value) : null)
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Mô tả chi tiết / Phường xã áp dụng
                </label>
                <textarea
                  rows={2}
                  placeholder="Ghi rõ bán kính hoặc các phường được phục vụ..."
                  value={zoneDescription}
                  onChange={(e) => setZoneDescription(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Thứ tự ưu tiên
                </label>
                <input
                  type="number"
                  value={zoneSortOrder}
                  onChange={(e) => setZoneSortOrder(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="zoneActiveCheck"
                  checked={zoneActive}
                  onChange={(e) => setZoneActive(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <label htmlFor="zoneActiveCheck" className="font-medium text-slate-700">
                  Đang mở nhận đơn giao tới vùng này
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateZoneOpen(false)
                    setEditingZone(null)
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingZone}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition flex items-center gap-1.5 shadow-2xs"
                >
                  {isSubmittingZone ? (
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Lưu Vùng Giao</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
