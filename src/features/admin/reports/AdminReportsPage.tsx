import { useState, type FC } from 'react'
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
} from 'lucide-react'

type TimeRange = 'today' | '7days' | 'month'

export const AdminReportsPage: FC = () => {
  const [timeRange, setTimeRange] = useState<TimeRange>('today')

  // Sample operational business data tuned for Tiger 345
  const reportData = {
    today: {
      label: 'Hôm nay (21/09/2026)',
      revenue: 8450000,
      revenueGrowth: '+12.4% so với hôm qua',
      orderCount: 38,
      avgOrderValue: 222368,
      guestCount: 94,
      dineInRevenue: 6250000,
      dineInCount: 26,
      deliveryRevenue: 2200000,
      deliveryCount: 12,
      cashRevenue: 3400000,
      bankingRevenue: 5050000,
      hourlyTraffic: [
        { hour: '10:00', orders: 2, amount: 350000 },
        { hour: '11:00', orders: 6, amount: 1420000 },
        { hour: '12:00', orders: 11, amount: 2680000 },
        { hour: '13:00', orders: 4, amount: 890000 },
        { hour: '17:00', orders: 3, amount: 620000 },
        { hour: '18:00', orders: 8, amount: 1850000 },
        { hour: '19:00', orders: 12, amount: 2840000 },
        { hour: '20:00', orders: 7, amount: 1540000 },
      ],
      topItems: [
        { name: 'Bò lúc lắc khoai tây', count: 18, revenue: 1980000, percent: 85 },
        { name: 'Gà nướng muối ớt (Nửa con)', count: 14, revenue: 1680000, percent: 70 },
        { name: 'Lẩu Thái hải sản chua cay', count: 9, revenue: 2340000, percent: 55 },
        { name: 'Mực chiên giòn sốt me', count: 11, revenue: 1045000, percent: 45 },
        { name: 'Bia Tiger Bạc (Lon)', count: 48, revenue: 960000, percent: 95 },
      ],
    },
    '7days': {
      label: '7 ngày qua',
      revenue: 54800000,
      revenueGrowth: '+8.6% so với tuần trước',
      orderCount: 245,
      avgOrderValue: 223673,
      guestCount: 680,
      dineInRevenue: 39500000,
      dineInCount: 165,
      deliveryRevenue: 15300000,
      deliveryCount: 80,
      cashRevenue: 19800000,
      bankingRevenue: 35000000,
      hourlyTraffic: [
        { hour: 'T2', orders: 32, amount: 7200000 },
        { hour: 'T3', orders: 28, amount: 6400000 },
        { hour: 'T4', orders: 30, amount: 6800000 },
        { hour: 'T5', orders: 34, amount: 7600000 },
        { hour: 'T6', orders: 42, amount: 9800000 },
        { hour: 'T7', orders: 50, amount: 11800000 },
        { hour: 'CN', orders: 45, amount: 10200000 },
      ],
      topItems: [
        { name: 'Bò lúc lắc khoai tây', count: 98, revenue: 10780000, percent: 90 },
        { name: 'Lẩu Thái hải sản chua cay', count: 54, revenue: 14040000, percent: 80 },
        { name: 'Gà nướng muối ớt (Nửa con)', count: 76, revenue: 9120000, percent: 72 },
        { name: 'Mực chiên giòn sốt me', count: 62, revenue: 5890000, percent: 50 },
        { name: 'Bia Tiger Bạc (Lon)', count: 280, revenue: 5600000, percent: 95 },
      ],
    },
    month: {
      label: 'Tháng 09/2026',
      revenue: 168500000,
      revenueGrowth: '+15.2% so với tháng trước',
      orderCount: 780,
      avgOrderValue: 216025,
      guestCount: 2100,
      dineInRevenue: 122000000,
      dineInCount: 520,
      deliveryRevenue: 46500000,
      deliveryCount: 260,
      cashRevenue: 58500000,
      bankingRevenue: 110000000,
      hourlyTraffic: [
        { hour: 'Tuần 1', orders: 180, amount: 39500000 },
        { hour: 'Tuần 2', orders: 195, amount: 42000000 },
        { hour: 'Tuần 3', orders: 205, amount: 45500000 },
        { hour: 'Tuần 4', orders: 200, amount: 41500000 },
      ],
      topItems: [
        { name: 'Bò lúc lắc khoai tây', count: 320, revenue: 35200000, percent: 92 },
        { name: 'Lẩu Thái hải sản chua cay', count: 185, revenue: 48100000, percent: 85 },
        { name: 'Gà nướng muối ớt (Nửa con)', count: 240, revenue: 28800000, percent: 75 },
        { name: 'Mực chiên giòn sốt me', count: 190, revenue: 18050000, percent: 58 },
        { name: 'Bia Tiger Bạc (Lon)', count: 940, revenue: 18800000, percent: 98 },
      ],
    },
  }[timeRange]

  const dineInPercent = Math.round((reportData.dineInRevenue / reportData.revenue) * 100)
  const deliveryPercent = 100 - dineInPercent

  const bankingPercent = Math.round((reportData.bankingRevenue / reportData.revenue) * 100)
  const cashPercent = 100 - bankingPercent

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header with Time Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Báo cáo & Doanh thu Vận hành
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Theo dõi tổng quan tài chính, kênh bán hàng và món ăn bán chạy
          </p>
        </div>

        <div className="flex items-center space-x-2 self-start sm:self-auto">
          {/* Time range toggle */}
          <div className="bg-slate-200/70 p-0.5 rounded-lg flex items-center text-xs">
            <button
              type="button"
              onClick={() => setTimeRange('today')}
              className={`px-3 py-1.5 rounded-md font-medium transition ${
                timeRange === 'today'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Hôm nay
            </button>
            <button
              type="button"
              onClick={() => setTimeRange('7days')}
              className={`px-3 py-1.5 rounded-md font-medium transition ${
                timeRange === '7days'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              7 ngày qua
            </button>
            <button
              type="button"
              onClick={() => setTimeRange('month')}
              className={`px-3 py-1.5 rounded-md font-medium transition ${
                timeRange === 'month'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tháng này
            </button>
          </div>

          {/* Export CSV button */}
          <button
            type="button"
            onClick={() => alert('Xuất báo cáo định dạng Excel/CSV')}
            className="p-2 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg text-slate-600 transition"
            title="Tải báo cáo Excel"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 4 Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Revenue */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Doanh thu</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <p className="text-2xl font-bold font-mono text-slate-900">
              {reportData.revenue.toLocaleString('vi-VN')}
              <span className="text-sm font-normal text-slate-500 ml-1">đ</span>
            </p>
          </div>
          <div className="mt-2 flex items-center space-x-1 text-[11px] text-emerald-600 font-medium">
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>{reportData.revenueGrowth}</span>
          </div>
        </div>

        {/* Order count */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Đơn hàng hoàn tất</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <p className="text-2xl font-bold font-mono text-slate-900">
              {reportData.orderCount}
              <span className="text-sm font-normal text-slate-500 ml-1">đơn</span>
            </p>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            {reportData.dineInCount} tại quán · {reportData.deliveryCount} giao online
          </p>
        </div>

        {/* Average order value */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Giá trị trung bình/đơn</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <p className="text-2xl font-bold font-mono text-slate-900">
              {reportData.avgOrderValue.toLocaleString('vi-VN')}
              <span className="text-sm font-normal text-slate-500 ml-1">đ</span>
            </p>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            Đạt mức chuẩn mục tiêu quán ăn
          </p>
        </div>

        {/* Guests count */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Lượt khách phục vụ</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <p className="text-2xl font-bold font-mono text-slate-900">
              {reportData.guestCount}
              <span className="text-sm font-normal text-slate-500 ml-1">khách</span>
            </p>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            Ước tính ~2.4 người/bàn
          </p>
        </div>
      </div>

      {/* Main Analysis Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Top Bestsellers & Channel Breakdown */}
        <div className="lg:col-span-2 space-y-6">
          {/* Channel and Payment Breakdown */}
          <div className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-2xs">
            <h2 className="text-sm font-bold text-slate-900 mb-4">
              Cơ cấu Doanh thu & Kênh Bán Hàng
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Channel */}
              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-700">Kênh bán hàng</span>
                  <span className="text-slate-400 text-[11px]">Tại quán vs Giao hàng</span>
                </div>

                <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex">
                  <div
                    style={{ width: `${dineInPercent}%` }}
                    className="bg-blue-600 transition-all duration-300"
                    title={`Tại quán: ${dineInPercent}%`}
                  />
                  <div
                    style={{ width: `${deliveryPercent}%` }}
                    className="bg-emerald-500 transition-all duration-300"
                    title={`Giao hàng: ${deliveryPercent}%`}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg">
                    <div className="flex items-center space-x-1.5 text-blue-600 font-semibold mb-1">
                      <span className="w-2 h-2 rounded-full bg-blue-600" />
                      <span>Tại quán ({dineInPercent}%)</span>
                    </div>
                    <p className="font-mono font-bold text-slate-900 text-sm">
                      {reportData.dineInRevenue.toLocaleString('vi-VN')}đ
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{reportData.dineInCount} lượt bàn</p>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg">
                    <div className="flex items-center space-x-1.5 text-emerald-600 font-semibold mb-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span>Giao hàng ({deliveryPercent}%)</span>
                    </div>
                    <p className="font-mono font-bold text-slate-900 text-sm">
                      {reportData.deliveryRevenue.toLocaleString('vi-VN')}đ
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{reportData.deliveryCount} đơn online</p>
                  </div>
                </div>
              </div>

              {/* Payment Methods */}
              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-700">Phương thức thanh toán</span>
                  <span className="text-slate-400 text-[11px]">Tiền mặt vs Chuyển khoản</span>
                </div>

                <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex">
                  <div
                    style={{ width: `${bankingPercent}%` }}
                    className="bg-blue-500 transition-all duration-300"
                    title={`Chuyển khoản: ${bankingPercent}%`}
                  />
                  <div
                    style={{ width: `${cashPercent}%` }}
                    className="bg-amber-500 transition-all duration-300"
                    title={`Tiền mặt: ${cashPercent}%`}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg">
                    <div className="flex items-center space-x-1.5 text-blue-600 font-semibold mb-1">
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>Chuyển khoản ({bankingPercent}%)</span>
                    </div>
                    <p className="font-mono font-bold text-slate-900 text-sm">
                      {reportData.bankingRevenue.toLocaleString('vi-VN')}đ
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Mã QR VietQR / App ngân hàng</p>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg">
                    <div className="flex items-center space-x-1.5 text-amber-600 font-semibold mb-1">
                      <Banknote className="w-3.5 h-3.5" />
                      <span>Tiền mặt ({cashPercent}%)</span>
                    </div>
                    <p className="font-mono font-bold text-slate-900 text-sm">
                      {reportData.cashRevenue.toLocaleString('vi-VN')}đ
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Thu ngân kiểm đếm cuối ca</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Top Bestseller Items */}
          <div className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-2xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Top Món Ăn Bán Chạy Nhất
                </h2>
                <p className="text-[11px] text-slate-500">
                  Xếp hạng theo số lượng gọi món và đóng góp doanh thu
                </p>
              </div>
              <Utensils className="w-4 h-4 text-slate-400" />
            </div>

            <div className="space-y-4">
              {reportData.topItems.map((item, idx) => (
                <div key={idx} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2">
                      <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 font-bold text-[10px] flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <span className="font-semibold text-slate-900">{item.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-semibold text-slate-900">
                        {item.revenue.toLocaleString('vi-VN')}đ
                      </span>
                      <span className="text-[10px] text-slate-400 ml-2">({item.count} phần)</span>
                    </div>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${item.percent}%` }}
                      className="h-full bg-blue-600 rounded-full transition-all duration-300"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Rush Hour Traffic & Quick Operational Summary */}
        <div className="space-y-6">
          {/* Rush Hour Traffic */}
          <div className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-2xs">
            <h2 className="text-sm font-bold text-slate-900 mb-1">
              Phân bố Đơn theo Khung Giờ
            </h2>
            <p className="text-[11px] text-slate-500 mb-4">
              Nhận diện khung giờ cao điểm để chuẩn bị bếp
            </p>

            <div className="space-y-3">
              {reportData.hourlyTraffic.map((t, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-slate-50 last:border-0">
                  <div className="flex items-center space-x-2 w-16">
                    <span className="font-mono text-slate-600 font-medium">{t.hour}</span>
                  </div>

                  <div className="flex-1 mx-3">
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        style={{ width: `${Math.min(100, (t.orders / 14) * 100)}%` }}
                        className="h-full bg-blue-600/80 rounded-full"
                      />
                    </div>
                  </div>

                  <div className="text-right w-24">
                    <span className="font-bold text-slate-900 font-mono text-[11px]">
                      {t.orders} đơn
                    </span>
                    <span className="block text-[9px] text-slate-400 font-mono">
                      {Math.round(t.amount / 1000)}k
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 p-3 bg-blue-50/60 border border-blue-100 rounded-lg text-xs text-blue-900 space-y-1">
              <p className="font-semibold text-[11px]">Khung giờ cao điểm ghi nhận:</p>
              <p className="text-[11px] text-blue-800 leading-relaxed">
                • <strong>Trưa:</strong> 11:30 - 13:00 (dân văn phòng & giao cơm trưa)
                <br />
                • <strong>Tối:</strong> 18:30 - 20:30 (khách gia đình, lẩu & lai rai)
              </p>
            </div>
          </div>

          {/* Operational Shift Advice */}
          <div className="bg-slate-900 text-white rounded-xl p-5 shadow-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400 mb-2">
              Lưu ý Giao Ca & Bếp
            </h3>
            <ul className="text-xs space-y-2 text-slate-300">
              <li className="flex items-start space-x-2">
                <span className="text-blue-400 mt-0.5">•</span>
                <span>Kiểm tra lại số dư tiền mặt ngăn kéo thu ngân trước khi đổi ca</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-blue-400 mt-0.5">•</span>
                <span>Bò lúc lắc và Lẩu Thái tiêu thụ nhanh, chuẩn bị sẵn định lượng sơ chế</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-blue-400 mt-0.5">•</span>
                <span>Đối soát hóa đơn chuyển khoản qua biến động số dư ngân hàng</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
