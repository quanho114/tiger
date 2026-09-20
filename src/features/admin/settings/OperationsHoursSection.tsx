import { useState, type FC, type FormEvent } from 'react'
import { adminApi } from '../../../lib/api/client'
import { ApiError } from '../../../lib/api/types'
import type {
  AdminRestaurantSettings,
  AdminBusinessHour,
  AdminBusinessClosure,
} from '../types'

interface OperationsHoursSectionProps {
  settings: AdminRestaurantSettings | null
  businessHours: AdminBusinessHour[]
  businessClosures: AdminBusinessClosure[]
  onReload: () => Promise<void>
  onNotify: (text: string, type: 'success' | 'error') => void
}

const WEEKDAYS = [
  { id: 1, label: 'Thứ 2' },
  { id: 2, label: 'Thứ 3' },
  { id: 3, label: 'Thứ 4' },
  { id: 4, label: 'Thứ 5' },
  { id: 5, label: 'Thứ 6' },
  { id: 6, label: 'Thứ 7' },
  { id: 0, label: 'Chủ Nhật' },
]

export const OperationsHoursSection: FC<OperationsHoursSectionProps> = ({
  settings,
  businessHours,
  businessClosures,
  onReload,
  onNotify,
}) => {
  // Settings Form State
  const [acceptingOrders, setAcceptingOrders] = useState<boolean>(settings?.accepting_orders ?? true)
  const [acceptingDineIn, setAcceptingDineIn] = useState<boolean>(settings?.accepting_dine_in_orders ?? true)
  const [acceptingDelivery, setAcceptingDelivery] = useState<boolean>(settings?.accepting_delivery_orders ?? true)
  const [bookingEnabled, setBookingEnabled] = useState<boolean>(settings?.booking_enabled ?? true)
  const [minDeliveryVnd, setMinDeliveryVnd] = useState<number>(settings?.min_delivery_order_vnd ?? 100000)

  const [resMinNotice, setResMinNotice] = useState<number>(settings?.reservation_min_notice_minutes ?? 120)
  const [resMaxDays, setResMaxDays] = useState<number>(settings?.reservation_max_days_ahead ?? 30)
  const [resDuration, setResDuration] = useState<number>(settings?.reservation_duration_minutes ?? 120)
  const [resCancelNotice, setResCancelNotice] = useState<number>(settings?.reservation_cancel_notice_minutes ?? 60)
  const [resGraceMins, setResGraceMins] = useState<number>(settings?.reservation_no_show_grace_minutes ?? 15)

  const [restaurantPhone, setRestaurantPhone] = useState<string>(settings?.phone ?? '')
  const [restaurantZalo, setRestaurantZalo] = useState<string>(settings?.zalo ?? '')
  const [restaurantFacebook, setRestaurantFacebook] = useState<string>(settings?.facebook ?? '')
  const [restaurantAddress, setRestaurantAddress] = useState<string>(settings?.address ?? '')
  const [restaurantMapsUrl, setRestaurantMapsUrl] = useState<string>(settings?.maps_url ?? '')

  const [isSavingSettings, setIsSavingSettings] = useState<boolean>(false)

  // Business Hours Local State
  const [localHours, setLocalHours] = useState<AdminBusinessHour[]>(businessHours)
  const [isSavingHours, setIsSavingHours] = useState<boolean>(false)

  // New Hour Row State
  const [newHourWeekday, setNewHourWeekday] = useState<number>(1)
  const [newHourService, setNewHourService] = useState<'restaurant' | 'delivery' | 'reservation'>('restaurant')
  const [newHourOpen, setNewHourOpen] = useState<string>('10:00')
  const [newHourClose, setNewHourClose] = useState<string>('22:00')

  // Business Closures Local State
  const [localClosures, setLocalClosures] = useState<AdminBusinessClosure[]>(businessClosures)
  const [isSavingClosures, setIsSavingClosures] = useState<boolean>(false)

  // New Closure State
  const [newClosureDate, setNewClosureDate] = useState<string>('')
  const [newClosureService, setNewClosureService] = useState<'restaurant' | 'delivery' | 'reservation' | 'all'>('all')
  const [newClosureReason, setNewClosureReason] = useState<string>('Bảo trì cơ sở vật chất')

  // --------------------------------------------------------------------------
  // Save General Settings (with OCC locking)
  // --------------------------------------------------------------------------
  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault()
    if (!settings) return

    setIsSavingSettings(true)
    try {
      await adminApi.patch('/settings', {
        accepting_orders: acceptingOrders,
        accepting_dine_in_orders: acceptingDineIn,
        accepting_delivery_orders: acceptingDelivery,
        booking_enabled: bookingEnabled,
        min_delivery_order_vnd: Number(minDeliveryVnd),
        reservation_min_notice_minutes: Number(resMinNotice),
        reservation_max_days_ahead: Number(resMaxDays),
        reservation_duration_minutes: Number(resDuration),
        reservation_cancel_notice_minutes: Number(resCancelNotice),
        reservation_no_show_grace_minutes: Number(resGraceMins),
        phone: restaurantPhone.trim(),
        zalo: restaurantZalo.trim(),
        facebook: restaurantFacebook.trim(),
        address: restaurantAddress.trim(),
        maps_url: restaurantMapsUrl.trim(),
        expected_version: settings.version,
      })
      onNotify('Cập nhật cấu hình hoạt động thành công!', 'success')
      await onReload()
    } catch (err: unknown) {
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') {
        onNotify('Xung đột phiên bản cài đặt nhà hàng. Vui lòng thử lại!', 'error')
        await onReload()
      } else {
        onNotify(err instanceof Error ? err.message : 'Lỗi khi lưu cài đặt', 'error')
      }
    } finally {
      setIsSavingSettings(false)
    }
  }

  // --------------------------------------------------------------------------
  // Business Hours Management (Atomic Invariant V24)
  // --------------------------------------------------------------------------
  const handleAddHourRow = () => {
    if (newHourOpen >= newHourClose) {
      alert('Giờ mở cửa phải trước giờ đóng cửa')
      return
    }

    // Check duplicate/overlap locally
    const exists = localHours.some(
      (h) =>
        h.weekday === newHourWeekday &&
        h.service_type === newHourService &&
        h.open_time === newHourOpen &&
        h.close_time === newHourClose
    )
    if (exists) {
      alert('Khung giờ này đã có trong danh sách!')
      return
    }

    setLocalHours([
      ...localHours,
      {
        weekday: newHourWeekday,
        service_type: newHourService,
        open_time: newHourOpen,
        close_time: newHourClose,
        active: true,
      },
    ])
  }

  const handleRemoveHourRow = (index: number) => {
    setLocalHours(localHours.filter((_, i) => i !== index))
  }

  const handleSaveHours = async () => {
    if (!settings) return
    setIsSavingHours(true)
    try {
      await adminApi.put('/settings/hours', {
        hours: localHours.map((h) => ({
          weekday: h.weekday,
          service_type: h.service_type,
          open_time: h.open_time,
          close_time: h.close_time,
        })),
        expected_version: settings.version,
      })
      onNotify('Đã lưu toàn bộ khung giờ hoạt động nguyên tử!', 'success')
      await onReload()
    } catch (err: unknown) {
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') {
        onNotify('Xung đột phiên bản cấu hình khi cập nhật lịch. Đang tải lại...', 'error')
        await onReload()
      } else {
        onNotify(err instanceof Error ? err.message : 'Lỗi cập nhật lịch hoạt động', 'error')
      }
    } finally {
      setIsSavingHours(false)
    }
  }

  // --------------------------------------------------------------------------
  // Business Closures Management (Atomic Invariant V24)
  // --------------------------------------------------------------------------
  const handleAddClosureRow = () => {
    if (!newClosureDate) {
      alert('Vui lòng chọn ngày đóng cửa')
      return
    }

    const exists = localClosures.some(
      (c) => c.date === newClosureDate && c.service_type === newClosureService
    )
    if (exists) {
      alert('Lịch đóng cửa cho ngày và dịch vụ này đã tồn tại!')
      return
    }

    setLocalClosures([
      ...localClosures,
      {
        date: newClosureDate,
        service_type: newClosureService,
        reason: newClosureReason.trim() || 'Nghỉ định kỳ',
      },
    ])
    setNewClosureDate('')
  }

  const handleRemoveClosureRow = (index: number) => {
    setLocalClosures(localClosures.filter((_, i) => i !== index))
  }

  const handleSaveClosures = async () => {
    if (!settings) return
    setIsSavingClosures(true)
    try {
      await adminApi.put('/settings/closures', {
        closures: localClosures.map((c) => ({
          date: c.date,
          service_type: c.service_type,
          reason: c.reason,
        })),
        expected_version: settings.version,
      })
      onNotify('Đã lưu danh sách ngày đóng cửa tạm thời!', 'success')
      await onReload()
    } catch (err: unknown) {
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') {
        onNotify('Xung đột phiên bản khi lưu lịch nghỉ. Đang tải lại...', 'error')
        await onReload()
      } else {
        onNotify(err instanceof Error ? err.message : 'Lỗi khi lưu ngày đóng cửa', 'error')
      }
    } finally {
      setIsSavingClosures(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* General Operations Configuration */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 shadow-sm space-y-5">
        <div className="border-b border-stone-800 pb-3">
          <h2 className="text-sm font-bold text-stone-200 uppercase tracking-wider flex items-center gap-2">
            <span>⚙️ Chế Độ Vận Hành & Tiếp Nhận Đơn Hàng</span>
          </h2>
          <p className="text-xs text-stone-400 mt-0.5">
            Bật/tắt các kênh nhận đơn trực tuyến và quy định điều kiện đặt bàn
          </p>
        </div>

        <form onSubmit={handleSaveSettings} className="space-y-5">
          {/* Main Switches */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-stone-950 p-4 rounded-xl border border-stone-800">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptingOrders}
                onChange={(e) => setAcceptingOrders(e.target.checked)}
                className="w-4 h-4 rounded border-stone-700 bg-stone-900 text-amber-500 focus:ring-amber-500"
              />
              <div>
                <div className="text-xs font-bold text-stone-200">Nhận đơn hàng chung</div>
                <div className="text-[11px] text-stone-400">Cho phép hệ thống order hoạt động</div>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptingDineIn}
                onChange={(e) => setAcceptingDineIn(e.target.checked)}
                className="w-4 h-4 rounded border-stone-700 bg-stone-900 text-amber-500 focus:ring-amber-500"
              />
              <div>
                <div className="text-xs font-bold text-stone-200">Order tại bàn (Dine-in)</div>
                <div className="text-[11px] text-stone-400">Khách quét QR gọi món tại quán</div>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptingDelivery}
                onChange={(e) => setAcceptingDelivery(e.target.checked)}
                className="w-4 h-4 rounded border-stone-700 bg-stone-900 text-amber-500 focus:ring-amber-500"
              />
              <div>
                <div className="text-xs font-bold text-stone-200">Giao hàng tận nơi</div>
                <div className="text-[11px] text-stone-400">Nhận đơn ship giao tận nhà</div>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={bookingEnabled}
                onChange={(e) => setBookingEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-stone-700 bg-stone-900 text-amber-500 focus:ring-amber-500"
              />
              <div>
                <div className="text-xs font-bold text-stone-200">Đặt bàn trước</div>
                <div className="text-[11px] text-stone-400">Khách có thể đặt giữ chỗ online</div>
              </div>
            </label>
          </div>

          {/* Delivery & Reservation Parameters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1">
                Đơn hàng ship tối thiểu (VNĐ)
              </label>
              <input
                type="number"
                min={0}
                step={10000}
                value={minDeliveryVnd}
                onChange={(e) => setMinDeliveryVnd(Number(e.target.value))}
                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-100 font-mono focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1">
                Báo trước tối thiểu đặt bàn (phút)
              </label>
              <input
                type="number"
                min={15}
                value={resMinNotice}
                onChange={(e) => setResMinNotice(Number(e.target.value))}
                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-100 font-mono focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1">
                Đặt trước tối đa (ngày)
              </label>
              <input
                type="number"
                min={1}
                max={90}
                value={resMaxDays}
                onChange={(e) => setResMaxDays(Number(e.target.value))}
                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-100 font-mono focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1">
                Thời lượng giữ bàn dự kiến (phút)
              </label>
              <input
                type="number"
                min={30}
                value={resDuration}
                onChange={(e) => setResDuration(Number(e.target.value))}
                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-100 font-mono focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1">
                Hạn hủy bàn tối thiểu (phút)
              </label>
              <input
                type="number"
                min={0}
                value={resCancelNotice}
                onChange={(e) => setResCancelNotice(Number(e.target.value))}
                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-100 font-mono focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1">
                Gia hạn chờ khách đến trễ (phút)
              </label>
              <input
                type="number"
                min={5}
                value={resGraceMins}
                onChange={(e) => setResGraceMins(Number(e.target.value))}
                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-100 font-mono focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Restaurant Contact Details */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-stone-800">
            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1">Số điện thoại hotline</label>
              <input
                type="text"
                value={restaurantPhone}
                onChange={(e) => setRestaurantPhone(e.target.value)}
                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-100 font-mono focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1">Link Zalo hỗ trợ</label>
              <input
                type="text"
                value={restaurantZalo}
                onChange={(e) => setRestaurantZalo(e.target.value)}
                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1">Link Fanpage Facebook</label>
              <input
                type="text"
                value={restaurantFacebook}
                onChange={(e) => setRestaurantFacebook(e.target.value)}
                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-stone-300 mb-1">Địa chỉ hiển thị</label>
              <input
                type="text"
                value={restaurantAddress}
                onChange={(e) => setRestaurantAddress(e.target.value)}
                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1">Google Maps URL</label>
              <input
                type="text"
                value={restaurantMapsUrl}
                onChange={(e) => setRestaurantMapsUrl(e.target.value)}
                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-100 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isSavingSettings}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold rounded-xl transition shadow-xs flex items-center gap-1.5"
            >
              {isSavingSettings && (
                <span className="w-3.5 h-3.5 border-2 border-stone-950 border-t-transparent rounded-full animate-spin" />
              )}
              <span>Lưu Cài Đặt Vận Hành</span>
            </button>
          </div>
        </form>
      </div>

      {/* Business Hours Configuration */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-800 pb-3">
          <div>
            <h2 className="text-sm font-bold text-stone-200 uppercase tracking-wider flex items-center gap-2">
              <span>🕒 Lịch Hoạt Động Định Kỳ Hàng Tuần</span>
            </h2>
            <p className="text-xs text-stone-400 mt-0.5">
              Khung giờ mở cửa phục vụ tại chỗ, giao hàng và tiếp nhận đặt bàn
            </p>
          </div>
          <button
            type="button"
            onClick={handleSaveHours}
            disabled={isSavingHours}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs rounded-xl shadow-xs transition self-start sm:self-auto flex items-center gap-1.5"
          >
            {isSavingHours && (
              <span className="w-3.5 h-3.5 border-2 border-stone-950 border-t-transparent rounded-full animate-spin" />
            )}
            <span>Lưu Lịch Hoạt Động</span>
          </button>
        </div>

        {/* Add Row Controls */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 bg-stone-950 p-3 rounded-xl border border-stone-800 text-xs">
          <div>
            <label className="block text-[11px] text-stone-400 mb-1">Thứ trong tuần</label>
            <select
              value={newHourWeekday}
              onChange={(e) => setNewHourWeekday(Number(e.target.value))}
              className="w-full bg-stone-900 border border-stone-800 rounded-lg px-2.5 py-1.5 text-stone-200"
            >
              {WEEKDAYS.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-stone-400 mb-1">Dịch vụ</label>
            <select
              value={newHourService}
              onChange={(e) =>
                setNewHourService(e.target.value as 'restaurant' | 'delivery' | 'reservation')
              }
              className="w-full bg-stone-900 border border-stone-800 rounded-lg px-2.5 py-1.5 text-stone-200"
            >
              <option value="restaurant">Nhà hàng (Tại chỗ)</option>
              <option value="delivery">Giao hàng</option>
              <option value="reservation">Đặt bàn</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-stone-400 mb-1">Giờ mở cửa</label>
            <input
              type="time"
              value={newHourOpen}
              onChange={(e) => setNewHourOpen(e.target.value)}
              className="w-full bg-stone-900 border border-stone-800 rounded-lg px-2.5 py-1.5 text-stone-200 font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] text-stone-400 mb-1">Giờ đóng cửa</label>
            <input
              type="time"
              value={newHourClose}
              onChange={(e) => setNewHourClose(e.target.value)}
              className="w-full bg-stone-900 border border-stone-800 rounded-lg px-2.5 py-1.5 text-stone-200 font-mono"
            />
          </div>

          <div className="col-span-2 sm:col-span-1 flex items-end">
            <button
              type="button"
              onClick={handleAddHourRow}
              className="w-full py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-100 font-semibold rounded-lg transition"
            >
              + Thêm Khung Giờ
            </button>
          </div>
        </div>

        {/* Existing Hours List */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-stone-400 bg-stone-950/80 border-b border-stone-800">
              <tr>
                <th className="py-2.5 px-3">Ngày</th>
                <th className="py-2.5 px-3">Dịch vụ áp dụng</th>
                <th className="py-2.5 px-3">Khung giờ hoạt động</th>
                <th className="py-2.5 px-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-800/60 text-stone-300">
              {localHours.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-stone-500">
                    Chưa có khung giờ nào được thiết lập
                  </td>
                </tr>
              ) : (
                localHours.map((h, idx) => {
                  const dayObj = WEEKDAYS.find((w) => w.id === h.weekday)
                  return (
                    <tr key={idx} className="hover:bg-stone-800/30">
                      <td className="py-2.5 px-3 font-semibold text-stone-200">
                        {dayObj?.label || `Thứ ${h.weekday}`}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded text-[11px] bg-stone-950 border border-stone-800">
                          {h.service_type === 'restaurant'
                            ? '🍽️ Tại chỗ'
                            : h.service_type === 'delivery'
                            ? '🛵 Giao hàng'
                            : '📅 Đặt bàn'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-amber-400">
                        {h.open_time} - {h.close_time}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoveHourRow(idx)}
                          className="text-stone-500 hover:text-rose-400"
                        >
                          ✕ Xóa
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Business Closures Configuration */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-800 pb-3">
          <div>
            <h2 className="text-sm font-bold text-stone-200 uppercase tracking-wider flex items-center gap-2">
              <span>🏖️ Đóng Cửa Tạm Thời / Nghỉ Lễ Tết</span>
            </h2>
            <p className="text-xs text-stone-400 mt-0.5">
              Thiết lập các ngày tạm dừng tiếp nhận đơn và khóa đặt bàn trực tuyến
            </p>
          </div>
          <button
            type="button"
            onClick={handleSaveClosures}
            disabled={isSavingClosures}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs rounded-xl shadow-xs transition self-start sm:self-auto flex items-center gap-1.5"
          >
            {isSavingClosures && (
              <span className="w-3.5 h-3.5 border-2 border-stone-950 border-t-transparent rounded-full animate-spin" />
            )}
            <span>Lưu Danh Sách Nghỉ</span>
          </button>
        </div>

        {/* Add Closure Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 bg-stone-950 p-3 rounded-xl border border-stone-800 text-xs">
          <div>
            <label className="block text-[11px] text-stone-400 mb-1">Ngày đóng cửa</label>
            <input
              type="date"
              value={newClosureDate}
              onChange={(e) => setNewClosureDate(e.target.value)}
              className="w-full bg-stone-900 border border-stone-800 rounded-lg px-2.5 py-1.5 text-stone-200 font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] text-stone-400 mb-1">Dịch vụ tạm ngưng</label>
            <select
              value={newClosureService}
              onChange={(e) =>
                setNewClosureService(e.target.value as 'restaurant' | 'delivery' | 'reservation' | 'all')
              }
              className="w-full bg-stone-900 border border-stone-800 rounded-lg px-2.5 py-1.5 text-stone-200"
            >
              <option value="all">Toàn bộ nhà hàng</option>
              <option value="restaurant">Chỉ tại chỗ</option>
              <option value="delivery">Chỉ giao hàng</option>
              <option value="reservation">Chỉ đặt bàn</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-stone-400 mb-1">Lý do nghỉ</label>
            <input
              type="text"
              placeholder="VD: Nghỉ Tết Nguyên Đán"
              value={newClosureReason}
              onChange={(e) => setNewClosureReason(e.target.value)}
              className="w-full bg-stone-900 border border-stone-800 rounded-lg px-2.5 py-1.5 text-stone-200"
            />
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={handleAddClosureRow}
              className="w-full py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-100 font-semibold rounded-lg transition"
            >
              + Thêm Ngày Nghỉ
            </button>
          </div>
        </div>

        {/* Existing Closures List */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-stone-400 bg-stone-950/80 border-b border-stone-800">
              <tr>
                <th className="py-2.5 px-3">Ngày nghỉ</th>
                <th className="py-2.5 px-3">Phạm vi tạm dừng</th>
                <th className="py-2.5 px-3">Lý do</th>
                <th className="py-2.5 px-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-800/60 text-stone-300">
              {localClosures.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-stone-500">
                    Không có ngày đóng cửa nào được lên lịch
                  </td>
                </tr>
              ) : (
                localClosures.map((c, idx) => (
                  <tr key={idx} className="hover:bg-stone-800/30">
                    <td className="py-2.5 px-3 font-mono font-bold text-stone-200">{c.date}</td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded text-[11px] bg-rose-950/60 text-rose-300 border border-rose-800/60">
                        {c.service_type === 'all'
                          ? 'Toàn bộ'
                          : c.service_type === 'restaurant'
                          ? 'Tại chỗ'
                          : c.service_type === 'delivery'
                          ? 'Giao hàng'
                          : 'Đặt bàn'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-stone-400">{c.reason}</td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleRemoveClosureRow(idx)}
                        className="text-stone-500 hover:text-rose-400"
                      >
                        ✕ Xóa
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
