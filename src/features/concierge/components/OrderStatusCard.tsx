import type { FC } from 'react'
import { Package, Clock, CheckCircle } from 'lucide-react'
import type { OrderStatusCardData } from '../types'

interface OrderStatusCardProps {
  orderStatus: OrderStatusCardData
}

export const OrderStatusCard: FC<OrderStatusCardProps> = ({ orderStatus }) => {
  return (
    <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-4 text-xs space-y-2">
      <div className="flex items-center justify-between border-b border-stone-100 pb-2">
        <div className="flex items-center gap-1.5 font-bold text-stone-900">
          <Package className="w-4 h-4 text-[#234386]" />
          <span>Mã đơn: #{orderStatus.order_code}</span>
        </div>
        <span className={`px-2 py-0.5 rounded-full font-semibold uppercase text-[10px] ${
          orderStatus.status === 'pending'
            ? 'bg-amber-100 text-amber-800'
            : orderStatus.status === 'confirmed'
            ? 'bg-emerald-100 text-emerald-800'
            : 'bg-blue-50 text-blue-800'
        }`}>
          {orderStatus.status === 'pending' ? 'Chờ nhà hàng xác nhận' : orderStatus.status === 'confirmed' ? 'Đã xác nhận' : orderStatus.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-stone-600">
        <div>
          <span>Số món: </span>
          <strong className="text-stone-900">{orderStatus.item_count} món</strong>
        </div>
        <div>
          <span>Tổng tiền: </span>
          <strong className="text-[#234386]">
            {orderStatus.total_vnd.toLocaleString('vi-VN')} đ
          </strong>
        </div>
      </div>

      {orderStatus.estimated_delivery_time && (
        <div className="flex items-center gap-1.5 text-stone-700 bg-stone-50 p-2 rounded">
          <Clock className="w-3.5 h-3.5 text-amber-600" />
          <span>Thời gian dự kiến: <strong>{orderStatus.estimated_delivery_time}</strong></span>
        </div>
      )}

      <div className="flex items-center gap-1 text-[11px] text-emerald-700 pt-1">
        <CheckCircle className="w-3.5 h-3.5" />
        <span>
          {orderStatus.status === 'pending'
            ? 'Đơn hàng đã được lưu, đang chờ nhân viên liên hệ xác nhận (chưa nấu).'
            : 'Đơn hàng đã được xác nhận trên hệ thống bếp Tiger.'}
        </span>
      </div>
    </div>
  )
}
