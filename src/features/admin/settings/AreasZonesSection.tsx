import { useState, type FC, type FormEvent } from 'react'
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
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-800 pb-3">
          <div>
            <h2 className="text-sm font-bold text-stone-200 uppercase tracking-wider flex items-center gap-2">
              <span>🏛️ Khu Vực Bàn & Không Gian Quán</span>
            </h2>
            <p className="text-xs text-stone-400 mt-0.5">
              Phân chia không gian bàn ăn (Trong nhà, Sân thượng, Ngoài trời, Phòng VIP)
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenCreateArea}
            className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs rounded-xl shadow-xs transition self-start sm:self-auto"
          >
            + Thêm Khu Vực
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-stone-400 bg-stone-950/80 border-b border-stone-800">
              <tr>
                <th className="py-2.5 px-3">Mã khu vực</th>
                <th className="py-2.5 px-3">Tên khu vực</th>
                <th className="py-2.5 px-3">Thứ tự</th>
                <th className="py-2.5 px-3">Trạng thái</th>
                <th className="py-2.5 px-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-800/60 text-stone-300">
              {seatingAreas.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-stone-500">
                    Chưa có khu vực bàn nào được tạo
                  </td>
                </tr>
              ) : (
                seatingAreas.map((area) => (
                  <tr key={area.id} className="hover:bg-stone-800/30">
                    <td className="py-2.5 px-3 font-mono font-bold text-amber-400">{area.code}</td>
                    <td className="py-2.5 px-3 font-semibold text-stone-100">{area.name}</td>
                    <td className="py-2.5 px-3 font-mono text-stone-400">{area.sort_order}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                          area.active
                            ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                            : 'bg-stone-950 text-stone-500 border-stone-800'
                        }`}
                      >
                        {area.active ? 'Hoạt động' : 'Tạm khóa'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => handleOpenEditArea(area)}
                        className="text-stone-400 hover:text-white"
                      >
                        Sửa
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteArea(area)}
                        className="text-stone-500 hover:text-rose-400"
                      >
                        Xóa
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
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-800 pb-3">
          <div>
            <h2 className="text-sm font-bold text-stone-200 uppercase tracking-wider flex items-center gap-2">
              <span>🛵 Khu Vực Giao Hàng & Phí Ship</span>
            </h2>
            <p className="text-xs text-stone-400 mt-0.5">
              Cấu hình phạm vi bán kính, phí vận chuyển và ngưỡng miễn phí ship
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenCreateZone}
            className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs rounded-xl shadow-xs transition self-start sm:self-auto"
          >
            + Thêm Khu Vực Ship
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-stone-400 bg-stone-950/80 border-b border-stone-800">
              <tr>
                <th className="py-2.5 px-3">Khu vực ship</th>
                <th className="py-2.5 px-3">Phí giao hàng</th>
                <th className="py-2.5 px-3">Miễn phí ship từ</th>
                <th className="py-2.5 px-3">Mô tả phạm vi</th>
                <th className="py-2.5 px-3">Trạng thái</th>
                <th className="py-2.5 px-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-800/60 text-stone-300">
              {deliveryZones.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-stone-500">
                    Chưa có khu vực giao hàng nào được cấu hình
                  </td>
                </tr>
              ) : (
                deliveryZones.map((zone) => (
                  <tr key={zone.id} className="hover:bg-stone-800/30">
                    <td className="py-2.5 px-3 font-semibold text-stone-100">{zone.name}</td>
                    <td className="py-2.5 px-3 font-mono font-bold text-amber-400">
                      {zone.fee_vnd.toLocaleString('vi-VN')}đ
                    </td>
                    <td className="py-2.5 px-3 font-mono text-emerald-400">
                      {zone.free_threshold_vnd
                        ? `${zone.free_threshold_vnd.toLocaleString('vi-VN')}đ`
                        : 'Không hỗ trợ'}
                    </td>
                    <td className="py-2.5 px-3 text-stone-400 text-[11px]">{zone.description || '—'}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                          zone.active
                            ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                            : 'bg-stone-950 text-stone-500 border-stone-800'
                        }`}
                      >
                        {zone.active ? 'Hoạt động' : 'Tạm dừng'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => handleOpenEditZone(zone)}
                        className="text-stone-400 hover:text-white"
                      >
                        Sửa
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteZone(zone)}
                        className="text-stone-500 hover:text-rose-400"
                      >
                        Xóa
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
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <h3 className="text-base font-bold text-stone-100">
                {editingArea ? `Sửa Khu Vực: ${editingArea.name}` : 'Thêm Khu Vực Bàn Mới'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsCreateAreaOpen(false)
                  setEditingArea(null)
                }}
                className="text-stone-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveArea} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-stone-300 mb-1">
                  Mã khu vực (Code) <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="VD: INDOOR, OUTDOOR, ROOFTOP, VIP"
                  value={areaCode}
                  onChange={(e) => setAreaCode(e.target.value.toUpperCase())}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-100 font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-300 mb-1">
                  Tên hiển thị khu vực <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="VD: Sảnh Tầng 1, Sân Thượng Thoáng Mát"
                  value={areaName}
                  onChange={(e) => setAreaName(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-300 mb-1">
                  Thứ tự hiển thị
                </label>
                <input
                  type="number"
                  value={areaSortOrder}
                  onChange={(e) => setAreaSortOrder(Number(e.target.value))}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-100 font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="areaActiveCheck"
                  checked={areaActive}
                  onChange={(e) => setAreaActive(e.target.checked)}
                  className="rounded border-stone-700 bg-stone-950 text-amber-500 focus:ring-amber-500"
                />
                <label htmlFor="areaActiveCheck" className="text-xs text-stone-300">
                  Khu vực đang mở cửa tiếp khách
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateAreaOpen(false)
                    setEditingArea(null)
                  }}
                  className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-semibold rounded-xl transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingArea}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold rounded-xl transition flex items-center gap-1.5"
                >
                  {isSubmittingArea && (
                    <span className="w-3.5 h-3.5 border-2 border-stone-950 border-t-transparent rounded-full animate-spin" />
                  )}
                  <span>{editingArea ? 'Lưu cập nhật' : 'Tạo khu vực'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Delivery Zone Create / Edit */}
      {(isCreateZoneOpen || editingZone) && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <h3 className="text-base font-bold text-stone-100">
                {editingZone ? `Sửa Khu Vực Ship: ${editingZone.name}` : 'Thêm Khu Vực Giao Hàng'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsCreateZoneOpen(false)
                  setEditingZone(null)
                }}
                className="text-stone-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveZone} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-stone-300 mb-1">
                  Tên khu vực ship <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="VD: Trung tâm thị xã Sa Pa (< 3km)"
                  value={zoneName}
                  onChange={(e) => setZoneName(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-300 mb-1">
                  Mô tả phạm vi áp dụng
                </label>
                <input
                  type="text"
                  placeholder="VD: Các phường Cầu Mây, Sa Pả, Phan Si Păng"
                  value={zoneDescription}
                  onChange={(e) => setZoneDescription(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-stone-300 mb-1">
                    Phí giao hàng (VNĐ) <span className="text-amber-400">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    step={1000}
                    value={zoneFeeVnd}
                    onChange={(e) => setZoneFeeVnd(Number(e.target.value))}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-100 font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-300 mb-1">
                    Freeship từ (VNĐ)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={10000}
                    placeholder="Không áp dụng"
                    value={zoneFreeThresholdVnd ?? ''}
                    onChange={(e) =>
                      setZoneFreeThresholdVnd(e.target.value ? Number(e.target.value) : null)
                    }
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-100 font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="zoneActiveCheck"
                  checked={zoneActive}
                  onChange={(e) => setZoneActive(e.target.checked)}
                  className="rounded border-stone-700 bg-stone-950 text-amber-500 focus:ring-amber-500"
                />
                <label htmlFor="zoneActiveCheck" className="text-xs text-stone-300">
                  Đang nhận giao hàng tại khu vực này
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateZoneOpen(false)
                    setEditingZone(null)
                  }}
                  className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-semibold rounded-xl transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingZone}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold rounded-xl transition flex items-center gap-1.5"
                >
                  {isSubmittingZone && (
                    <span className="w-3.5 h-3.5 border-2 border-stone-950 border-t-transparent rounded-full animate-spin" />
                  )}
                  <span>{editingZone ? 'Lưu cập nhật' : 'Tạo khu vực ship'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
