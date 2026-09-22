import { useState, useMemo, type FC } from 'react'
import {
  TrendingUp,
  DollarSign,
  ShoppingBag,
  Users,
  CreditCard,
  Banknote,
  Utensils,
  ArrowUpRight,
  Download,
  Clock,
  CalendarDays,
  MoreHorizontal,
  Check,
  ShieldCheck,
  Flame,
  Armchair,
  CheckCircle2,
} from 'lucide-react'

type TimeRange = 'today' | '7days' | 'month'

interface LiveTable {
  id: string
  code: string
  items: string
  staff: {
    name: string
    avatarBg: string
    initials: string
  }
  status: 'dining' | 'waiting_food' | 'ready_to_pay' | 'completed'
  statusLabel: string
  room: string
  amount: number
}

export const AdminReportsPage: FC = () => {
  const [timeRange, setTimeRange] = useState<TimeRange>('today')
  const [notification, setNotification] = useState<string | null>(null)
  const [activeBarIndex, setActiveBarIndex] = useState<number | null>(null)

  const showToast = (msg: string) => {
    setNotification(msg)
    setTimeout(() => {
      setNotification((prev) => (prev === msg ? null : prev))
    }, 3200)
  }

  // Dữ liệu báo cáo vận hành Tiger 345
  const reportData = useMemo(() => {
    return {
      today: {
        label: 'Hôm nay (21/09/2026)',
        revenue: 8450000,
        revenueGrowth: '+12.4%',
        revenueCompareText: 'so với hôm qua',
        orderCount: 38,
        avgOrderValue: 222368,
        guestCount: 94,
        dineInRevenue: 6250000,
        dineInCount: 26,
        deliveryRevenue: 2200000,
        deliveryCount: 12,
        cashRevenue: 3400000,
        bankingRevenue: 5050000,
        avgWaitTime: '12 mins',
        completedRatio: '32/142',
        avgDineTime: '32 mins',
        hourlyTraffic: [
          { hour: '8 am', orders: 2, amount: 350000, percent: 28, isPeak: false },
          { hour: '10 am', orders: 6, amount: 1420000, percent: 42, isPeak: false },
          { hour: '12 am', orders: 12, amount: 2840000, percent: 90, isPeak: false },
          { hour: '2 pm', orders: 4, amount: 890000, percent: 53, isPeak: false },
          { hour: '4 pm', orders: 14, amount: 3120000, percent: 74, isPeak: true },
          { hour: '6 pm', orders: 9, amount: 2150000, percent: 88, isPeak: false },
          { hour: '8 pm', orders: 7, amount: 1540000, percent: 50, isPeak: false },
        ],
        topItems: [
          { name: 'Bò lúc lắc khoai tây', count: 18, revenue: 1980000, percent: 92 },
          { name: 'Lẩu Thái hải sản chua cay', count: 9, revenue: 2340000, percent: 84 },
          { name: 'Gà nướng muối ớt (Nửa con)', count: 14, revenue: 1680000, percent: 72 },
          { name: 'Mực chiên giòn sốt me', count: 11, revenue: 1045000, percent: 55 },
          { name: 'Bia Tiger Bạc (Lon)', count: 48, revenue: 960000, percent: 98 },
        ],
      },
      '7days': {
        label: '7 ngày qua',
        revenue: 54800000,
        revenueGrowth: '+8.6%',
        revenueCompareText: 'so với tuần trước',
        orderCount: 245,
        avgOrderValue: 223673,
        guestCount: 680,
        dineInRevenue: 39500000,
        dineInCount: 165,
        deliveryRevenue: 15300000,
        deliveryCount: 80,
        cashRevenue: 19800000,
        bankingRevenue: 35000000,
        avgWaitTime: '14 mins',
        completedRatio: '245/260',
        avgDineTime: '38 mins',
        hourlyTraffic: [
          { hour: 'T2', orders: 32, amount: 7200000, percent: 50, isPeak: false },
          { hour: 'T3', orders: 28, amount: 6400000, percent: 45, isPeak: false },
          { hour: 'T4', orders: 30, amount: 6800000, percent: 48, isPeak: false },
          { hour: 'T5', orders: 34, amount: 7600000, percent: 55, isPeak: false },
          { hour: 'T6', orders: 42, amount: 9800000, percent: 70, isPeak: false },
          { hour: 'T7', orders: 50, amount: 11800000, percent: 95, isPeak: true },
          { hour: 'CN', orders: 45, amount: 10200000, percent: 85, isPeak: false },
        ],
        topItems: [
          { name: 'Bò lúc lắc khoai tây', count: 98, revenue: 10780000, percent: 94 },
          { name: 'Lẩu Thái hải sản chua cay', count: 54, revenue: 14040000, percent: 88 },
          { name: 'Gà nướng muối ớt (Nửa con)', count: 76, revenue: 9120000, percent: 78 },
          { name: 'Mực chiên giòn sốt me', count: 62, revenue: 5890000, percent: 62 },
          { name: 'Bia Tiger Bạc (Lon)', count: 280, revenue: 5600000, percent: 96 },
        ],
      },
      month: {
        label: 'Tháng 09/2026',
        revenue: 168500000,
        revenueGrowth: '+15.2%',
        revenueCompareText: 'so với tháng trước',
        orderCount: 780,
        avgOrderValue: 216025,
        guestCount: 2100,
        dineInRevenue: 122000000,
        dineInCount: 520,
        deliveryRevenue: 46500000,
        deliveryCount: 260,
        cashRevenue: 58500000,
        bankingRevenue: 110000000,
        avgWaitTime: '13 mins',
        completedRatio: '780/810',
        avgDineTime: '36 mins',
        hourlyTraffic: [
          { hour: 'Tuần 1', orders: 180, amount: 39500000, percent: 65, isPeak: false },
          { hour: 'Tuần 2', orders: 195, amount: 42000000, percent: 72, isPeak: false },
          { hour: 'Tuần 3', orders: 205, amount: 45500000, percent: 92, isPeak: true },
          { hour: 'Tuần 4', orders: 200, amount: 41500000, percent: 78, isPeak: false },
        ],
        topItems: [
          { name: 'Bò lúc lắc khoai tây', count: 320, revenue: 35200000, percent: 95 },
          { name: 'Lẩu Thái hải sản chua cay', count: 185, revenue: 48100000, percent: 90 },
          { name: 'Gà nướng muối ớt (Nửa con)', count: 240, revenue: 28800000, percent: 80 },
          { name: 'Mực chiên giòn sốt me', count: 190, revenue: 18050000, percent: 66 },
          { name: 'Bia Tiger Bạc (Lon)', count: 940, revenue: 18800000, percent: 99 },
        ],
      },
    }[timeRange]
  }, [timeRange])

  // Danh sách bàn trực tiếp chuẩn Elera Live Occupancy
  const liveTables: LiveTable[] = [
    {
      id: 't-1',
      code: 'A',
      items: 'Anya K, 44M · Sprained Wrist',
      staff: { name: 'Dr. Ramirez', avatarBg: 'bg-[#00aa98]', initials: 'A' },
      status: 'waiting_food',
      statusLabel: 'In Treatment',
      room: '20A',
      amount: 1280000,
    },
    {
      id: 't-2',
      code: 'N',
      items: 'Nazmi J, 22M · Fungal Infection',
      staff: { name: 'Dr. Patel', avatarBg: 'bg-[#52c45c]', initials: 'N' },
      status: 'waiting_food',
      statusLabel: 'In Treatment',
      room: '21C',
      amount: 890000,
    },
    {
      id: 't-3',
      code: 'M',
      items: 'Meya L, 67F · Stomach Ache',
      staff: { name: 'Dr. Laura', avatarBg: 'bg-[#3b82f6]', initials: 'M' },
      status: 'dining',
      statusLabel: 'Waiting',
      room: '22B',
      amount: 3450000,
    },
    {
      id: 't-4',
      code: 'E',
      items: 'Elle S, 33F · Muscle Strain',
      staff: { name: 'Dr. Aris', avatarBg: 'bg-[#f59e0b]', initials: 'E' },
      status: 'dining',
      statusLabel: 'Waiting',
      room: '23D',
      amount: 640000,
    },
    {
      id: 't-5',
      code: 'D',
      items: 'David M, 51M · Coughing',
      staff: { name: 'Dr. Lopez', avatarBg: 'bg-[#8b5cf6]', initials: 'D' },
      status: 'completed',
      statusLabel: 'Completed',
      room: '24E',
      amount: 1120000,
    },
    {
      id: 't-6',
      code: 'F',
      items: 'Finn P, 88M · Allergy',
      staff: { name: 'Dr. Chen', avatarBg: 'bg-[#ec4899]', initials: 'F' },
      status: 'completed',
      statusLabel: 'Completed',
      room: '22B',
      amount: 950000,
    },
  ]

  // Tỉ lệ kênh & phương thức
  const dineInPercent = Math.round((reportData.dineInRevenue / reportData.revenue) * 100)
  const deliveryPercent = 100 - dineInPercent
  const bankingPercent = Math.round((reportData.bankingRevenue / reportData.revenue) * 100)
  const cashPercent = 100 - bankingPercent

  // Elera tactile multi-layer shadow
  const eleraCardShadow = '0 1px 1px rgba(0,0,0,.06), 0 3px 3px rgba(0,0,0,.06), 0 6px 6px rgba(0,0,0,.06), 0 12px 12px rgba(0,0,0,.04), 0 24px 24px rgba(0,0,0,.04)'

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 font-sans tracking-[-0.01em]">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#2b2e2c] text-white text-xs px-4 py-3 rounded-2xl shadow-2xl flex items-center space-x-2.5 border border-stone-700 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <CheckCircle2 className="w-4 h-4 text-[#7cd56e] shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {/* Header bar phong cách Elera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-[20px] font-medium tracking-[-0.25px] text-[#171a17]">
              Báo cáo & Doanh thu Vận hành
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded-[6px] text-[11px] font-medium bg-[#e4f7c6] text-[#3e6300]">
              Thời gian thực
            </span>
          </div>
          <p className="text-[12px] text-[#787979] mt-0.5">
            Phân tích số liệu tài chính, hiệu suất bếp, nhịp độ phục vụ khách tại bàn
          </p>
        </div>

        <div className="flex items-center space-x-2.5 self-start sm:self-auto">
          {/* Bộ lọc thời gian (Time Pill Switcher) */}
          <div className="bg-[#eeedeb] p-1 rounded-[14px] flex items-center text-[12px] border border-[#e2e3e3]">
            <button
              type="button"
              onClick={() => setTimeRange('today')}
              className={`px-3.5 py-1.5 rounded-[10px] font-medium transition-all ${
                timeRange === 'today'
                  ? 'bg-white text-[#171a17] shadow-xs font-semibold'
                  : 'text-[#5c5e63] hover:text-[#171a17]'
              }`}
            >
              Hôm nay
            </button>
            <button
              type="button"
              onClick={() => setTimeRange('7days')}
              className={`px-3.5 py-1.5 rounded-[10px] font-medium transition-all ${
                timeRange === '7days'
                  ? 'bg-white text-[#171a17] shadow-xs font-semibold'
                  : 'text-[#5c5e63] hover:text-[#171a17]'
              }`}
            >
              7 ngày qua
            </button>
            <button
              type="button"
              onClick={() => setTimeRange('month')}
              className={`px-3.5 py-1.5 rounded-[10px] font-medium transition-all ${
                timeRange === 'month'
                  ? 'bg-white text-[#171a17] shadow-xs font-semibold'
                  : 'text-[#5c5e63] hover:text-[#171a17]'
              }`}
            >
              Tháng này
            </button>
          </div>

          {/* Export button */}
          <button
            type="button"
            onClick={() => showToast('Đang tạo và tải xuống file Excel báo cáo doanh thu vận hành...')}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 border border-[#e2e3e3] bg-white hover:bg-[#faf9f7] rounded-[14px] text-xs font-medium text-[#424242] shadow-2xs transition active:scale-95"
          >
            <Download className="w-3.5 h-3.5 text-[#787979]" />
            <span className="hidden sm:inline">Xuất Excel</span>
          </button>
        </div>
      </div>

      {/* 4 KPI Stats Tiles theo Elera Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Doanh thu */}
        <div
          style={{ boxShadow: eleraCardShadow }}
          className="bg-white rounded-[20px] p-4.5 border border-[#e2e3e3]/50 transition hover:border-[#d2d2d2]"
        >
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-[#787979]">Gross Revenue</span>
            <div className="w-8 h-8 rounded-[10px] bg-[#424242] text-white flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-[#7cd56e]" />
            </div>
          </div>
          <div className="mt-2.5">
            <p className="text-[24px] font-semibold font-mono tracking-tight text-[#171a17]">
              {reportData.revenue.toLocaleString('vi-VN')}
              <span className="text-[14px] font-normal text-[#787979] ml-1">đ</span>
            </p>
          </div>
          <div className="mt-2 flex items-center space-x-1 text-[11px] font-medium text-[#2e5b15]">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-[4px] bg-[#e4f7c6]">
              <ArrowUpRight className="w-3 h-3 mr-0.5" />
              {reportData.revenueGrowth}
            </span>
            <span className="text-[#787979] font-normal">{reportData.revenueCompareText}</span>
          </div>
        </div>

        {/* Đơn hàng hoàn tất */}
        <div
          style={{ boxShadow: eleraCardShadow }}
          className="bg-white rounded-[20px] p-4.5 border border-[#e2e3e3]/50 transition hover:border-[#d2d2d2]"
        >
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-[#787979]">Room Occupancy</span>
            <div className="w-8 h-8 rounded-[10px] bg-[#424242] text-white flex items-center justify-center">
              <ShoppingBag className="w-4 h-4 text-[#52c45c]" />
            </div>
          </div>
          <div className="mt-2.5">
            <p className="text-[24px] font-semibold font-mono tracking-tight text-[#171a17]">
              {reportData.orderCount}
              <span className="text-[14px] font-normal text-[#787979] ml-1">đơn</span>
            </p>
          </div>
          <p className="mt-2 text-[11px] text-[#787979]">
            <span className="font-semibold text-[#171a17]">{reportData.dineInCount}</span> tại quán ·{' '}
            <span className="font-semibold text-[#171a17]">{reportData.deliveryCount}</span> giao online
          </p>
        </div>

        {/* Giá trị trung bình/đơn */}
        <div
          style={{ boxShadow: eleraCardShadow }}
          className="bg-white rounded-[20px] p-4.5 border border-[#e2e3e3]/50 transition hover:border-[#d2d2d2]"
        >
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-[#787979]">Seen vs Scheduled</span>
            <div className="w-8 h-8 rounded-[10px] bg-[#424242] text-white flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-amber-400" />
            </div>
          </div>
          <div className="mt-2.5">
            <p className="text-[24px] font-semibold font-mono tracking-tight text-[#171a17]">
              {reportData.avgOrderValue.toLocaleString('vi-VN')}
              <span className="text-[14px] font-normal text-[#787979] ml-1">đ</span>
            </p>
          </div>
          <p className="mt-2 text-[11px] text-[#787979]">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#00b348] mr-1.5 align-middle" />
            Đạt mức chuẩn chỉ tiêu quán ăn
          </p>
        </div>

        {/* Lượt khách phục vụ */}
        <div
          style={{ boxShadow: eleraCardShadow }}
          className="bg-white rounded-[20px] p-4.5 border border-[#e2e3e3]/50 transition hover:border-[#d2d2d2]"
        >
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-[#787979]">Staff Utilization</span>
            <div className="w-8 h-8 rounded-[10px] bg-[#424242] text-white flex items-center justify-center">
              <Users className="w-4 h-4 text-sky-400" />
            </div>
          </div>
          <div className="mt-2.5">
            <p className="text-[24px] font-semibold font-mono tracking-tight text-[#171a17]">
              {reportData.guestCount}
              <span className="text-[14px] font-normal text-[#787979] ml-1">khách</span>
            </p>
          </div>
          <p className="mt-2 text-[11px] text-[#787979]">
            Ước tính trung bình ~2.4 người/bàn
          </p>
        </div>
      </div>

      {/* Row 1: Live Occupancy Bàn & Biểu đồ cột Peak Kitchen Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left 7 Cols: Bàn Đang Phục Vụ (chuẩn Elera Live Occupancy) */}
        <div
          style={{ boxShadow: eleraCardShadow }}
          className="lg:col-span-7 bg-white rounded-[20px] p-5 border border-[#e2e3e3]/50 flex flex-col justify-between"
        >
          <div>
            {/* Header đồng bộ 1 dòng chuẩn Elera */}
            <div className="flex items-center justify-between pb-3.5 border-b border-[#f0f0ee]">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-[10px] bg-[#424242] text-white flex items-center justify-center shadow-xs">
                  <Armchair className="w-4 h-4 text-[#7cd56e]" />
                </div>
                <div className="flex items-center space-x-2 flex-wrap">
                  <h2 className="text-[15.5px] font-medium tracking-[-0.25px] text-[#171a17]">
                    Live Occupancy
                  </h2>
                  <span className="px-1.5 py-0.5 rounded-[5px] text-[11px] font-medium bg-[#e5e6e3] text-[#484a48]">
                    15
                  </span>
                  <span className="text-[12px] text-[#8a8f89]">
                    8 in Triage, 7 in Treatment
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => showToast('Mở tùy chọn lọc bàn')}
                className="w-7 h-7 rounded-lg hover:bg-stone-100 flex items-center justify-center text-[#8e9094] transition"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="text-[#8a8f89] text-[12px] font-normal border-b border-[#f0f0ee]">
                    <th className="pb-2.5 font-normal">Patient</th>
                    <th className="pb-2.5 font-normal">Reason</th>
                    <th className="pb-2.5 font-normal">Assignee</th>
                    <th className="pb-2.5 font-normal">Status</th>
                    <th className="pb-2.5 font-normal text-right">Room</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f7f6f4]">
                  {liveTables.map((t) => (
                    <tr key={t.id} className="hover:bg-[#faf9f7] transition group">
                      <td className="py-3 font-medium text-[#171a17]">
                        <div className="flex items-center space-x-2.5">
                          <span
                            className={`w-6 h-6 rounded-full ${t.staff.avatarBg} text-white font-medium text-[11px] flex items-center justify-center`}
                          >
                            {t.code}
                          </span>
                          <span className="text-[#171a17]">{t.items.split(' · ')[0]}</span>
                        </div>
                      </td>
                      <td className="py-3 text-[#5c5e63] font-normal">
                        {t.items.split(' · ')[1] || 'General checkup'}
                      </td>
                      <td className="py-3 text-[#5c5e63]">
                        <div className="flex items-center space-x-1.5">
                          <span className="w-4 h-4 rounded-full bg-stone-300 text-[8px] font-bold flex items-center justify-center text-stone-700">
                            Dr
                          </span>
                          <span className="text-[12px]">{t.staff.name}</span>
                        </div>
                      </td>
                      <td className="py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-[6px] text-[11px] font-medium ${
                            t.statusLabel === 'Waiting'
                              ? 'bg-[#eaf7e8] text-[#2fa32a]'
                              : t.statusLabel === 'In Treatment'
                              ? 'bg-[#edf3fd] text-[#3d78e3]'
                              : 'bg-[#f0f1ef] text-[#6b6e6a]'
                          }`}
                        >
                          {t.statusLabel}
                        </span>
                      </td>
                      <td className="py-3 text-right font-mono font-medium text-[#787979]">
                        {t.room}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="pt-3.5 border-t border-[#f0f0ee] flex items-center justify-between text-[11px] text-[#787979]">
            <span>Đang theo dõi tự động từ hệ thống quản lý ca</span>
            <span className="font-medium text-[#171a17]">Tổng phòng: 15 / 24 đang hoạt động</span>
          </div>
        </div>

        {/* Right 5 Cols: Biểu đồ cột Peak Activity Times Today chuẩn Elera macOS */}
        <div
          style={{ boxShadow: eleraCardShadow }}
          className="lg:col-span-5 bg-white rounded-[20px] p-5 border border-[#e2e3e3]/50 flex flex-col justify-between"
        >
          <div>
            {/* Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-[#f0f0ee]">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-[10px] bg-[#424242] text-white flex items-center justify-center shadow-xs">
                  <Clock className="w-4 h-4 text-[#7cd56e]" />
                </div>
                <div>
                  <h2 className="text-[15.5px] font-medium tracking-[-0.25px] text-[#171a17]">
                    Peak Activity Times Today
                  </h2>
                </div>
              </div>

              <button
                type="button"
                onClick={() => showToast('Mở chi tiết tải ca')}
                className="w-7 h-7 rounded-lg hover:bg-stone-100 flex items-center justify-center text-[#8e9094] transition"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </div>

            {/* 3 Metric Pills chuẩn Elera: green bold text + 9px subtitle + 16px radius container */}
            <div className="grid grid-cols-3 gap-2.5 my-4">
              <div className="py-2 px-1 text-center border border-[#e0e1df] rounded-[16px] bg-white">
                <p className="text-[14px] font-medium text-[#00b348]">
                  {reportData.avgWaitTime}
                </p>
                <span className="text-[9px] text-[#9b9b9b] block leading-tight mt-0.5">
                  Avg. wait time
                </span>
              </div>

              <div className="py-2 px-1 text-center border border-[#e0e1df] rounded-[16px] bg-white">
                <p className="text-[14px] font-medium text-[#00b348]">
                  {reportData.completedRatio}
                </p>
                <span className="text-[9px] text-[#9b9b9b] block leading-tight mt-0.5">
                  Total patients today
                </span>
              </div>

              <div className="py-2 px-1 text-center border border-[#e0e1df] rounded-[16px] bg-white">
                <p className="text-[14px] font-medium text-[#00b348]">
                  {reportData.avgDineTime}
                </p>
                <span className="text-[9px] text-[#9b9b9b] block leading-tight mt-0.5">
                  Avg. treatment time
                </span>
              </div>
            </div>

            {/* Vertical Bar Chart chuẩn Elera (Y-axis 100/50/25/0 + Inset Shadow macOS bars) */}
            <div className="mt-4 pt-1 flex gap-3 h-[170px] relative">
              {/* Trục Y */}
              <div className="flex flex-col justify-between text-[11px] text-[#aeaeae] pb-6 pr-1 select-none font-mono">
                <span>100</span>
                <span>50</span>
                <span>25</span>
                <span>0</span>
              </div>

              {/* Chart Plot Area */}
              <div className="flex-1 flex flex-col justify-between relative pb-6">
                {/* Dashed Guides */}
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-6">
                  <div className="border-b border-[#ececec] w-full" />
                  <div className="border-b border-[#ececec] w-full" />
                  <div className="border-b border-[#ececec] w-full" />
                  <div className="border-b border-[#ececec] w-full" />
                </div>

                {/* Bars Container */}
                <div className="flex justify-between items-end h-full gap-2 relative z-10">
                  {reportData.hourlyTraffic.map((t, idx) => {
                    const isHovered = activeBarIndex === idx

                    return (
                      <div
                        key={t.hour}
                        className="flex-1 flex flex-col items-center group relative h-full justify-end"
                        onMouseEnter={() => setActiveBarIndex(idx)}
                        onMouseLeave={() => setActiveBarIndex(null)}
                      >
                        {/* Tooltip khi hover */}
                        {isHovered && (
                          <div className="absolute -top-9 z-20 bg-[#2b2e2c] text-white text-[10px] py-1 px-2 rounded-[6px] shadow-md whitespace-nowrap font-mono">
                            {t.percent}% · {t.orders} đơn
                          </div>
                        )}

                        {/* Tactile macOS Bar với inset shadow */}
                        <span
                          style={{
                            height: `${t.percent}%`,
                            boxShadow: t.isPeak
                              ? 'inset 0 -5px 12px rgba(0, 0, 0, 0.1)'
                              : 'inset 0 -13px 12px rgba(66, 66, 66, 0.05)',
                          }}
                          className={`w-full max-w-[38px] rounded-[10px] transition-all duration-300 cursor-pointer ${
                            t.isPeak
                              ? 'bg-[#52c45c]'
                              : 'bg-gradient-to-b from-[#f7f7f7] to-[#f3f3f3] hover:from-[#f0f0f0] hover:to-[#e8e8e8]'
                          }`}
                        />

                        {/* Label thời gian */}
                        <small className="absolute -bottom-5 text-[11px] text-[#aeaeae] whitespace-nowrap">
                          {t.hour}
                        </small>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Slider nhịp độ từ Less busy -> Busy chuẩn Elera */}
          <div className="mt-5 pt-3 border-t border-[#f0f0ee]">
            <div className="flex items-center justify-between text-[11px] text-[#787979] mb-1.5">
              <span>Less busy</span>
              <span>Busy</span>
            </div>
            <div className="h-1.5 w-full bg-gradient-to-r from-stone-200 via-[#e4f7c6] to-[#52c45c] rounded-full relative">
              <div className="absolute right-[20%] -top-1 w-3.5 h-3.5 rounded-full bg-[#2b2e2c] border-2 border-white shadow-xs" />
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: 3-Card Row (Thẻ Tối Contrast Calendar + Bubble Chart + Task List) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Card 1: Thẻ Lịch Tối Màu Sang Trọng (Chuẩn Volume Card #424242 của Elera) */}
        <div
          style={{ boxShadow: eleraCardShadow }}
          className="bg-[#424242] text-white rounded-[20px] p-5 flex flex-col justify-between"
        >
          <div>
            {/* Header với Icon Chip trắng đúng chất Elera */}
            <div className="flex items-center justify-between pb-3.5 border-b border-white/10">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-[10px] bg-white flex items-center justify-center text-[#424242] shadow-[inset_0_0_6px_#bdbdbd]">
                  <CalendarDays className="w-4 h-4 text-[#424242]" />
                </div>
                <div>
                  <h3 className="text-[16px] font-medium tracking-[-0.32px] text-white">
                    April Patient Volume
                  </h3>
                </div>
              </div>

              <button
                type="button"
                onClick={() => showToast('Xem lịch chi tiết tháng')}
                className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center text-stone-300 transition"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </div>

            {/* Days of week */}
            <div className="grid grid-cols-7 text-center text-[12px] font-normal text-[#c8c8c8] mt-4 mb-2">
              <span>S</span>
              <span>M</span>
              <span>T</span>
              <span>W</span>
              <span>T</span>
              <span>F</span>
              <span>S</span>
            </div>

            {/* Heatmap Matrix Circles chuẩn Elera: 32px diameter */}
            <div className="grid grid-cols-7 gap-y-2 gap-x-1.5 justify-items-center text-xs">
              {/* Row 1 */}
              <div className="w-8 h-8 rounded-full bg-[#626262] text-white flex items-center justify-center text-[13px]">
                <Check className="w-3.5 h-3.5 text-white stroke-[2.5]" />
              </div>
              <div className="w-8 h-8 rounded-full bg-[#a5a5a5] text-[#333] font-medium flex items-center justify-center text-[13px]">
                12
              </div>
              <div className="w-8 h-8 rounded-full bg-[#a5a5a5] text-[#333] font-medium flex items-center justify-center text-[13px]">
                49
              </div>
              <div className="w-8 h-8 rounded-full bg-[#a5a5a5] text-[#333] font-medium flex items-center justify-center text-[13px]">
                41
              </div>
              <div className="w-8 h-8 rounded-full bg-[#626262] text-white flex items-center justify-center text-[13px]">
                <Check className="w-3.5 h-3.5 text-white stroke-[2.5]" />
              </div>
              <div
                style={{
                  background:
                    'repeating-linear-gradient(140deg, transparent 0px, transparent 5px, rgb(103, 103, 103) 5px, rgb(103, 103, 103) 6px)',
                }}
                className="w-8 h-8 rounded-full border border-[#646464] flex items-center justify-center text-[13px]"
              />
              <div
                style={{
                  background:
                    'repeating-linear-gradient(140deg, transparent 0px, transparent 5px, rgb(103, 103, 103) 5px, rgb(103, 103, 103) 6px)',
                }}
                className="w-8 h-8 rounded-full border border-[#646464] flex items-center justify-center text-[13px]"
              />

              {/* Row 2 */}
              <div className="w-8 h-8 rounded-full bg-[#a5a5a5] text-[#333] font-medium flex items-center justify-center text-[13px]">
                12
              </div>
              <div className="w-8 h-8 rounded-full bg-[#a5a5a5] text-[#333] font-medium flex items-center justify-center text-[13px]">
                45
              </div>
              <div className="w-8 h-8 rounded-full bg-[#626262] text-white flex items-center justify-center text-[13px]">
                <Check className="w-3.5 h-3.5 text-white stroke-[2.5]" />
              </div>
              <div className="w-8 h-8 rounded-full bg-[#626262] text-white flex items-center justify-center text-[13px]">
                <Check className="w-3.5 h-3.5 text-white stroke-[2.5]" />
              </div>
              <div className="w-8 h-8 rounded-full bg-[#626262] text-white flex items-center justify-center text-[13px]">
                <Check className="w-3.5 h-3.5 text-white stroke-[2.5]" />
              </div>
              <div
                style={{
                  background:
                    'repeating-linear-gradient(140deg, transparent 0px, transparent 5px, rgb(103, 103, 103) 5px, rgb(103, 103, 103) 6px)',
                }}
                className="w-8 h-8 rounded-full border border-[#646464] flex items-center justify-center text-[13px]"
              />
              <div
                style={{
                  background:
                    'repeating-linear-gradient(140deg, transparent 0px, transparent 5px, rgb(103, 103, 103) 5px, rgb(103, 103, 103) 6px)',
                }}
                className="w-8 h-8 rounded-full border border-[#646464] flex items-center justify-center text-[13px]"
              />

              {/* Row 3 - có ngày hôm nay accent */}
              <div className="w-8 h-8 rounded-full bg-[#a5a5a5] text-[#333] font-medium flex items-center justify-center text-[13px]">
                29
              </div>
              <div className="w-8 h-8 rounded-full bg-[#626262] text-white flex items-center justify-center text-[13px]">
                <Check className="w-3.5 h-3.5 text-white stroke-[2.5]" />
              </div>
              <div className="w-8 h-8 rounded-full bg-[#a5a5a5] text-[#333] font-medium flex items-center justify-center text-[13px]">
                15
              </div>
              <div className="w-8 h-8 rounded-full bg-[#626262] text-white flex items-center justify-center text-[13px]">
                <Check className="w-3.5 h-3.5 text-white stroke-[2.5]" />
              </div>
              <div className="w-8 h-8 rounded-full bg-[#626262] text-white flex items-center justify-center text-[13px]">
                <Check className="w-3.5 h-3.5 text-white stroke-[2.5]" />
              </div>
              <div
                style={{
                  background:
                    'repeating-linear-gradient(140deg, transparent 0px, transparent 5px, rgb(103, 103, 103) 5px, rgb(103, 103, 103) 6px)',
                }}
                className="w-8 h-8 rounded-full border border-[#646464] flex items-center justify-center text-[13px]"
              />
              <div className="w-8 h-8 rounded-full bg-[#a5a5a5] text-[#333] font-medium flex items-center justify-center text-[13px]">
                2
              </div>

              {/* Row 4 */}
              <div className="w-8 h-8 rounded-full bg-[#a5a5a5] text-[#333] font-medium flex items-center justify-center text-[13px]">
                32
              </div>
              <div className="w-8 h-8 rounded-full bg-[#626262] text-white flex items-center justify-center text-[13px]">
                <Check className="w-3.5 h-3.5 text-white stroke-[2.5]" />
              </div>
              <div className="w-8 h-8 rounded-full bg-[#a5a5a5] text-[#333] font-medium flex items-center justify-center text-[13px]">
                51
              </div>
              <div className="w-8 h-8 rounded-full bg-[#626262] text-white flex items-center justify-center text-[13px]">
                <Check className="w-3.5 h-3.5 text-white stroke-[2.5]" />
              </div>
              <div
                style={{
                  background:
                    'repeating-linear-gradient(140deg, transparent 0px, transparent 5px, rgb(103, 103, 103) 5px, rgb(103, 103, 103) 6px)',
                }}
                className="w-8 h-8 rounded-full border border-[#646464] flex items-center justify-center text-[13px]"
              />
              <div className="w-8 h-8 rounded-full bg-[#7bd570] text-[#2c5528] font-bold flex items-center justify-center text-[13px] shadow-sm">
                32
              </div>
              <div className="w-8 h-8 rounded-full border border-[#595959] flex items-center justify-center" />
            </div>

            {/* Bottom empty indicators */}
            <div className="flex justify-center space-x-2 mt-4 pt-2">
              <span className="w-4 h-4 rounded-full border border-[#595959]" />
              <span className="w-4 h-4 rounded-full border border-[#595959]" />
              <span className="w-4 h-4 rounded-full border border-[#595959]" />
              <span className="w-4 h-4 rounded-full border border-[#595959]" />
              <span className="w-4 h-4 rounded-full border border-[#595959]" />
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[11px] text-stone-300">
            <span className="flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-[#7bd570]" />
              <span>Current day: 32 visits</span>
            </span>
            <span className="text-[#7bd570] font-medium">On target</span>
          </div>
        </div>

        {/* Card 2: Cụm Bong Bóng Cơ Cấu Món Ăn (Daily Caseload Bubble Style chuẩn Elera) */}
        <div
          style={{ boxShadow: eleraCardShadow }}
          className="bg-white rounded-[20px] p-5 border border-[#e2e3e3]/50 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between pb-3.5 border-b border-[#f0f0ee]">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-[10px] bg-[#424242] text-white flex items-center justify-center shadow-xs">
                  <Flame className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-[16px] font-medium tracking-[-0.25px] text-[#171a17]">
                    Daily Caseload
                  </h3>
                </div>
              </div>

              <button
                type="button"
                onClick={() => showToast('Xem danh mục chi tiết')}
                className="w-7 h-7 rounded-lg hover:bg-stone-100 flex items-center justify-center text-[#8e9094] transition"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </div>

            {/* Bubble Clusters chính xác theo tọa độ và mã màu Elera */}
            <div className="w-[236px] h-[176px] mx-auto relative my-4">
              {/* Bubble 1: Checkup (48%) - #f6fcba */}
              <div
                style={{
                  top: '0px',
                  left: '10px',
                  width: '132px',
                  height: '132px',
                  backgroundColor: '#f6fcba',
                  color: '#4e7200',
                }}
                className="rounded-full absolute flex flex-col items-center justify-center shadow-xs"
              >
                <span className="text-[20px] font-semibold font-mono">48%</span>
              </div>

              {/* Bubble 2: Emergency (15%) - #fceaf0 */}
              <div
                style={{
                  top: '25px',
                  left: '142px',
                  width: '68px',
                  height: '68px',
                  backgroundColor: '#fceaf0',
                  color: '#c03042',
                }}
                className="rounded-full absolute flex flex-col items-center justify-center shadow-xs"
              >
                <span className="text-[14px] font-semibold font-mono">15%</span>
              </div>

              {/* Bubble 3: Chronic (8%) - #d2f0fc */}
              <div
                style={{
                  top: '106px',
                  left: '128px',
                  width: '51px',
                  height: '51px',
                  backgroundColor: '#d2f0fc',
                  color: '#246084',
                }}
                className="rounded-full absolute flex flex-col items-center justify-center shadow-xs"
              >
                <span className="text-[12px] font-semibold font-mono">8%</span>
              </div>

              {/* Bubble 4: Other (3%) - #fdeedd */}
              <div
                style={{
                  top: '91px',
                  left: '181px',
                  width: '38px',
                  height: '38px',
                  backgroundColor: '#fdeedd',
                  color: '#df7000',
                }}
                className="rounded-full absolute flex flex-col items-center justify-center shadow-xs"
              >
                <span className="text-[11px] font-semibold font-mono">3%</span>
              </div>
            </div>
          </div>

          {/* Legend pills chuẩn Elera: rounded-full 100px with border #efefed */}
          <div className="grid grid-cols-2 gap-2 pt-3 border-t border-[#f0f0ee] text-[12px]">
            <span className="border border-[#efefed] rounded-full h-[23px] flex items-center justify-center gap-1.5 text-[#787979]">
              <span className="w-2 h-2 rounded-full bg-[#4e7200]" />
              <span>Checkup</span>
            </span>
            <span className="border border-[#efefed] rounded-full h-[23px] flex items-center justify-center gap-1.5 text-[#787979]">
              <span className="w-2 h-2 rounded-full bg-[#c03042]" />
              <span>Emergency</span>
            </span>
            <span className="border border-[#efefed] rounded-full h-[23px] flex items-center justify-center gap-1.5 text-[#787979]">
              <span className="w-2 h-2 rounded-full bg-[#246084]" />
              <span>Chronic</span>
            </span>
            <span className="border border-[#efefed] rounded-full h-[23px] flex items-center justify-center gap-1.5 text-[#787979]">
              <span className="w-2 h-2 rounded-full bg-[#df7000]" />
              <span>Check-up</span>
            </span>
          </div>
        </div>

        {/* Card 3: Staff Tasks & Authorizations chuẩn Elera */}
        <div
          style={{ boxShadow: eleraCardShadow }}
          className="bg-white rounded-[20px] p-5 border border-[#e2e3e3]/50 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between pb-3.5 border-b border-[#f0f0ee]">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-[10px] bg-[#424242] text-white flex items-center justify-center shadow-xs">
                  <ShieldCheck className="w-4 h-4 text-[#7cd56e]" />
                </div>
                <div>
                  <h3 className="text-[14px] font-medium tracking-[-0.25px] text-[#171a17]">
                    Staff Tasks & Authorizations
                  </h3>
                </div>
              </div>

              <span className="px-1.5 py-0.5 rounded-[5px] text-[11px] font-medium bg-[#e5e6e3] text-[#484b47]">
                12
              </span>
            </div>

            {/* Task list with actionable buttons */}
            <div className="divide-y divide-[#f7f6f4] mt-2">
              {/* Task 1 */}
              <div className="py-2.5 flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-medium text-[#171a17]">Appeal denied claim</p>
                  <p className="text-[11px] text-[#888a8e]">$4,280 · BlueCross · 6 days left</p>
                </div>
                <button
                  type="button"
                  onClick={() => showToast('Đã gửi kháng nghị thanh toán bảo hiểm')}
                  className="px-3 py-1 bg-[#424242] hover:bg-[#2b2e2c] text-white text-[11px] font-medium rounded-[8px] transition active:scale-95 shadow-2xs"
                >
                  Appeal
                </button>
              </div>

              {/* Task 2 */}
              <div className="py-2.5 flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-medium text-[#171a17]">Overtime approval</p>
                  <p className="text-[11px] text-[#888a8e]">Dr. Ramirez · 4.5h this week · $612 cost</p>
                </div>
                <button
                  type="button"
                  onClick={() => showToast('Đã phê duyệt ca làm thêm')}
                  className="px-3 py-1 border border-[#e2e3e5] text-[#424242] hover:bg-stone-50 text-[11px] font-medium rounded-[8px] transition active:scale-95"
                >
                  View
                </button>
              </div>

              {/* Task 3 */}
              <div className="py-2.5 flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-medium text-[#171a17]">Supplier contract renewal</p>
                  <p className="text-[11px] text-[#888a8e]">Ben .C - Fungal Infection</p>
                </div>
                <button
                  type="button"
                  onClick={() => showToast('Mở chi tiết hợp đồng cung cấp')}
                  className="px-3 py-1 border border-[#e2e3e5] text-[#424242] hover:bg-stone-50 text-[11px] font-medium rounded-[8px] transition active:scale-95"
                >
                  View
                </button>
              </div>

              {/* Task 4 */}
              <div className="py-2.5 flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-medium text-[#171a17]">MedSupply Co · 8% price increase</p>
                  <p className="text-[11px] text-[#888a8e]">MedSupply Co · 8% price increase</p>
                </div>
                <button
                  type="button"
                  onClick={() => showToast('Mở báo cáo biến động giá nhà cung ứng')}
                  className="px-3 py-1 border border-[#e2e3e5] text-[#424242] hover:bg-stone-50 text-[11px] font-medium rounded-[8px] transition active:scale-95"
                >
                  View
                </button>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-[#f0f0ee] text-[11px] text-[#787979]">
            <span>1 policy review pending · Updated HIPAA module</span>
          </div>
        </div>
      </div>

      {/* Row 3: Top Món Bán Chạy & Kênh Bán Hàng (Được trau chuốt lại thẩm mỹ cao cấp) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left 6 Cols: Top Món Bán Chạy */}
        <div
          style={{ boxShadow: eleraCardShadow }}
          className="lg:col-span-6 bg-white rounded-[20px] p-5 border border-[#e2e3e3]/50"
        >
          <div className="flex items-center justify-between pb-3.5 border-b border-[#f0f0ee] mb-4">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-[10px] bg-[#424242] text-white flex items-center justify-center shadow-xs">
                <Utensils className="w-4 h-4 text-[#7cd56e]" />
              </div>
              <div>
                <h2 className="text-[15.5px] font-medium tracking-[-0.25px] text-[#171a17]">
                  Top Món Ăn Bán Chạy Nhất
                </h2>
                <p className="text-[11px] text-[#787979]">Xếp hạng theo số lượt gọi và đóng góp doanh thu</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => showToast('Xem toàn bộ báo cáo thực đơn')}
              className="w-7 h-7 rounded-lg hover:bg-stone-100 flex items-center justify-center text-[#8e9094] transition"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-4">
            {reportData.topItems.map((item, idx) => (
              <div key={item.name} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2.5">
                    <span
                      className={`w-5 h-5 rounded-full font-mono font-bold text-[10px] flex items-center justify-center shrink-0 ${
                        idx === 0
                          ? 'bg-[#e4f7c6] text-[#2e5b15]'
                          : idx === 1
                          ? 'bg-[#eeedeb] text-[#171a17]'
                          : 'bg-stone-100 text-stone-500'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <span className="font-medium text-[#171a17]">{item.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-[#171a17]">
                      {item.revenue.toLocaleString('vi-VN')}đ
                    </span>
                    <span className="text-[10px] text-[#787979] ml-1.5 font-normal">
                      ({item.count} phần)
                    </span>
                  </div>
                </div>

                {/* Progress bar với tone xanh Elera */}
                <div className="h-2 bg-[#eeedeb] rounded-full overflow-hidden">
                  <div
                    style={{ width: `${item.percent}%` }}
                    className="h-full bg-[#52c45c] rounded-full transition-all duration-500"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right 6 Cols: Cơ cấu Doanh thu & Kênh Bán Hàng */}
        <div
          style={{ boxShadow: eleraCardShadow }}
          className="lg:col-span-6 bg-white rounded-[20px] p-5 border border-[#e2e3e3]/50 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between pb-3.5 border-b border-[#f0f0ee] mb-4">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-[10px] bg-[#424242] text-white flex items-center justify-center shadow-xs">
                  <Banknote className="w-4 h-4 text-[#7cd56e]" />
                </div>
                <div>
                  <h2 className="text-[15.5px] font-medium tracking-[-0.25px] text-[#171a17]">
                    Cơ Cấu Kênh & Dòng Tiền
                  </h2>
                  <p className="text-[11px] text-[#787979]">Tỉ lệ Tại quán vs Giao hàng, Chuyển khoản vs Tiền mặt</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => showToast('Mở chi tiết đối soát tài chính')}
                className="w-7 h-7 rounded-lg hover:bg-stone-100 flex items-center justify-center text-[#8e9094] transition"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-5">
              {/* Kênh bán hàng */}
              <div className="space-y-2.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-medium text-[#171a17]">Kênh bán hàng</span>
                  <span className="text-[#787979] text-[11px]">
                    Tại quán ({dineInPercent}%) vs Giao hàng ({deliveryPercent}%)
                  </span>
                </div>

                <div className="h-2.5 bg-[#eeedeb] rounded-full overflow-hidden flex">
                  <div
                    style={{ width: `${dineInPercent}%` }}
                    className="bg-[#424242] transition-all duration-300"
                  />
                  <div
                    style={{ width: `${deliveryPercent}%` }}
                    className="bg-[#52c45c] transition-all duration-300"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                  <div className="p-3 bg-[#faf9f7] border border-[#eeedeb] rounded-[14px]">
                    <div className="flex items-center space-x-1.5 font-medium text-[#2b2e2c] mb-1">
                      <span className="w-2 h-2 rounded-full bg-[#424242]" />
                      <span>Tại quán ({dineInPercent}%)</span>
                    </div>
                    <p className="font-mono font-bold text-sm text-[#171a17]">
                      {reportData.dineInRevenue.toLocaleString('vi-VN')}đ
                    </p>
                    <p className="text-[10px] text-[#787979] mt-0.5">{reportData.dineInCount} lượt bàn</p>
                  </div>

                  <div className="p-3 bg-[#faf9f7] border border-[#eeedeb] rounded-[14px]">
                    <div className="flex items-center space-x-1.5 font-medium text-[#2e5b15] mb-1">
                      <span className="w-2 h-2 rounded-full bg-[#52c45c]" />
                      <span>Giao hàng ({deliveryPercent}%)</span>
                    </div>
                    <p className="font-mono font-bold text-sm text-[#171a17]">
                      {reportData.deliveryRevenue.toLocaleString('vi-VN')}đ
                    </p>
                    <p className="text-[10px] text-[#787979] mt-0.5">{reportData.deliveryCount} đơn online</p>
                  </div>
                </div>
              </div>

              {/* Phương thức thanh toán */}
              <div className="space-y-2.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-medium text-[#171a17]">Phương thức thanh toán</span>
                  <span className="text-[#787979] text-[11px]">
                    VietQR ({bankingPercent}%) vs Tiền mặt ({cashPercent}%)
                  </span>
                </div>

                <div className="h-2.5 bg-[#eeedeb] rounded-full overflow-hidden flex">
                  <div
                    style={{ width: `${bankingPercent}%` }}
                    className="bg-sky-600 transition-all duration-300"
                  />
                  <div
                    style={{ width: `${cashPercent}%` }}
                    className="bg-amber-500 transition-all duration-300"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                  <div className="p-3 bg-[#faf9f7] border border-[#eeedeb] rounded-[14px]">
                    <div className="flex items-center space-x-1.5 font-medium text-sky-700 mb-1">
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>VietQR / Thẻ ({bankingPercent}%)</span>
                    </div>
                    <p className="font-mono font-bold text-sm text-[#171a17]">
                      {reportData.bankingRevenue.toLocaleString('vi-VN')}đ
                    </p>
                    <p className="text-[10px] text-[#787979] mt-0.5">Đối soát tự động ngân hàng</p>
                  </div>

                  <div className="p-3 bg-[#faf9f7] border border-[#eeedeb] rounded-[14px]">
                    <div className="flex items-center space-x-1.5 font-medium text-amber-700 mb-1">
                      <Banknote className="w-3.5 h-3.5" />
                      <span>Tiền mặt ({cashPercent}%)</span>
                    </div>
                    <p className="font-mono font-bold text-sm text-[#171a17]">
                      {reportData.cashRevenue.toLocaleString('vi-VN')}đ
                    </p>
                    <p className="text-[10px] text-[#787979] mt-0.5">Thu ngân kiểm đếm cuối ca</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#f0f0ee] text-[11px] text-[#787979] flex items-center justify-between">
            <span>Dữ liệu kế toán ca sáng & ca chiều</span>
            <span className="text-[#2e5b15] font-medium">98.5% đã hoàn tất thanh toán</span>
          </div>
        </div>
      </div>
    </div>
  )
}
