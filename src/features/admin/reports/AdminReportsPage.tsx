import { useEffect, useState, type FC } from 'react'
import { Download } from 'lucide-react'
import { adminApi } from '@/shared/lib/api/client'
import { useAdmin } from '../layout/AdminContext'
import { AdminLoading } from '../components/AdminLoading'
import { downloadCsv } from '../utils/downloadCsv'

interface Report {
  net_revenue: number
  received: number
  reversed: number
  payment_count: number
  cash: number
  bank_transfer: number
  daily: { day: string; revenue: number }[]
}

export const AdminReportsPage: FC = () => {
  const { refreshKey } = useAdmin()
  const [range, setRange] = useState('today')
  const [data, setData] = useState<Report | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    setData(null)
    setError(null)
    void adminApi.get<Report>(`/reports?range=${range}`).then(res => {
      if (active) setData(res.data)
    }).catch(err => {
      if (active) setError(err instanceof Error ? err.message : 'Không thể tải báo cáo')
    })
    return () => { active = false }
  }, [range, refreshKey])
  const money = (value: number) => `${value.toLocaleString('vi-VN')}đ`
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Báo cáo & Doanh thu Vận hành</h1>
          <p className="text-xs text-slate-500 mt-2">Theo ngày ghi nhận thanh toán, múi giờ Việt Nam. Thực thu = tiền nhận − hoàn tiền và điều chỉnh.</p>
        </div>
        <button className="elera-btn-secondary" disabled={!data} onClick={() => data && downloadCsv('bao-cao.csv', [['Ngày', 'Thực thu'], ...data.daily.map(d => [d.day, d.revenue])])}>
          <Download size={16} /> Xuất CSV
        </button>
      </div>
      <div className="flex gap-2">
        {([['today', 'Hôm nay'], ['7days', '7 ngày qua'], ['month', 'Tháng này']] as const).map(([value, label]) => (
          <button key={value} aria-pressed={range === value} onClick={() => setRange(value)} className={range === value ? 'elera-btn-primary' : 'elera-btn-secondary'}>{label}</button>
        ))}
      </div>
      {error ? <p role="alert" className="text-rose-600">{error}</p> : !data ? <AdminLoading variant="block" label="Đang tải báo cáo..." /> : <>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            ['Thực thu', money(data.net_revenue)], ['Tiền nhận', money(data.received)],
            ['Hoàn tiền / Điều chỉnh', money(data.reversed)], ['Lượt thanh toán', data.payment_count],
            ['Tiền mặt (ròng)', money(data.cash)], ['Chuyển khoản (ròng)', money(data.bank_transfer)],
          ].map(([label, value]) => <div key={label} className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500">{label}</p><p className="text-2xl font-bold mt-2">{value}</p>
          </div>)}
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="font-semibold mb-4">Thực thu theo ngày</h2>
          {data.daily.length === 0 ? <p className="text-slate-500 text-sm">Chưa có giao dịch thanh toán trong khoảng thời gian này.</p> :
            <table className="w-full text-sm"><thead><tr><th className="text-left p-2">Ngày</th><th className="text-right p-2">Thực thu</th></tr></thead>
              <tbody>{data.daily.map(d => <tr key={d.day} className="border-t border-slate-100"><td className="p-2">{d.day}</td><td className="text-right p-2">{money(d.revenue)}</td></tr>)}</tbody>
            </table>}
        </div>
      </>}
    </div>
  )
}
