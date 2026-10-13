import { useEffect, useRef, useState, type FormEvent } from 'react'
import { adminApi } from '@/shared/lib/api/client'
import { useAuth } from '../../auth'
import { ApiError } from '@/shared/lib/api/types'
import type { AdminMenuItem, AdminTableItem, AdminDeliveryZone } from '../types'

type OrderBody = { order_type: 'dine_in' | 'delivery'; table_id?: string; delivery_zone_id?: string; customer_name?: string; customer_phone?: string; address?: string; note: string; items: { menu_item_id: string; quantity: number; unit_price_vnd: number }[] }
type Pending = { key: string; body: OrderBody }

export function AdminCreateOrder({ initialType, onClose, onCreated }: { initialType: 'dine_in' | 'delivery'; onClose: () => void; onCreated: (id: string) => void }) {
  const { user } = useAuth()
  const storageKey = `tiger-admin-pending-order:${user?.id}`
  const [type, setType] = useState(initialType)
  const [menu, setMenu] = useState<AdminMenuItem[]>([])
  const [tables, setTables] = useState<AdminTableItem[]>([])
  const [zones, setZones] = useState<AdminDeliveryZone[]>([])
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [form, setForm] = useState({ table: '', zone: '', name: '', phone: '', address: '', note: '' })
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(() => {
    try { return JSON.parse(sessionStorage.getItem(storageKey) || 'null') as Pending | null } catch { return null }
  })
  const submitting = useRef(false)
  useEffect(() => {
    let active = true
    void Promise.all([
      (async () => {
        const items: AdminMenuItem[] = []
        let total = Infinity
        while (active && items.length < total) {
          const res = await adminApi.get<{ items: AdminMenuItem[]; total: number }>(`/menu-items?published=true&available=true&limit=200&offset=${items.length}`)
          items.push(...res.data.items); total = res.data.total
          if (!res.data.items.length) break
        }
        return { data: { items } }
      })(),
      adminApi.get<{ items: AdminTableItem[] }>('/tables'),
      adminApi.get<{ items: AdminDeliveryZone[] }>('/delivery-zones'),
    ]).then(([m, t, z]) => { if (active) { setMenu(m.data.items); setTables(t.data.items); setZones(z.data.items) } })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu tạo đơn') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting.current) return
    submitting.current = true; setBusy(true); setError(null)
    let attempt = pending
    try {
      if (!attempt) {
        const items = menu.filter(i => quantities[i.id] > 0).map(i => ({ menu_item_id: i.id, quantity: quantities[i.id], unit_price_vnd: i.price_vnd }))
        if (!items.length) throw new Error('Chọn ít nhất một món.')
        const body: OrderBody = { order_type: type, note: form.note, items, ...(type === 'dine_in' ? { table_id: form.table } : { delivery_zone_id: form.zone, customer_name: form.name, customer_phone: form.phone, address: form.address }) }
        attempt = { key: crypto.randomUUID(), body }
        sessionStorage.setItem(storageKey, JSON.stringify(attempt))
        setPending(attempt)
      }
      const res = await adminApi.post<{ receipt: { id: string } }>('/orders', attempt.body, { idempotencyKey: attempt.key })
      sessionStorage.removeItem(storageKey); setPending(null)
      onCreated(res.data.receipt.id)
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500 && ![408, 429].includes(err.status) && err.code !== 'IDEMPOTENCY_CONFLICT') {
        sessionStorage.removeItem(storageKey); setPending(null)
      }
      setError(err instanceof Error ? err.message : 'Không thể tạo đơn. Thử lại để kiểm tra kết quả.')
    } finally { submitting.current = false; setBusy(false) }
  }
  return <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="create-order-title">
    <form onSubmit={submit} className="bg-white rounded-xl p-5 w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-4">
      <div className="flex justify-between"><h2 id="create-order-title" className="font-bold">Tạo đơn hàng</h2><button type="button" disabled={busy} onClick={onClose}>Đóng</button></div>
      {error && <p role="alert" className="text-rose-600">{error}</p>}
      {pending && <p className="text-amber-700">Có yêu cầu tạo đơn đang chờ xác nhận. Bấm kiểm tra để lấy kết quả; hệ thống dùng lại mã yêu cầu để tránh tạo trùng.</p>}
      <fieldset disabled={busy || !!pending || loading} className="space-y-4">
        <label className="block">Loại đơn<select className="elera-input block w-full" value={type} onChange={e => { setType(e.target.value as typeof type); setQuantities({}) }}><option value="dine_in">Tại bàn</option><option value="delivery">Giao hàng</option></select></label>
        {type === 'dine_in' ? <label className="block">Bàn đang phục vụ<select aria-label="Bàn đang phục vụ" required className="elera-input block w-full" value={form.table} onChange={e => setForm({ ...form, table: e.target.value })}><option value="">Chọn bàn (mở bàn trong mục Bàn & Đặt chỗ)</option>{tables.filter(t => t.active && t.current_visit_id).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label> : <>
          {([['name', 'Tên khách'], ['phone', 'Số điện thoại'], ['address', 'Địa chỉ']] as const).map(([key, label]) => <label key={key} className="block">{label}<input required className="elera-input block w-full" value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} /></label>)}
          <label className="block">Khu vực giao<select aria-label="Khu vực giao" required className="elera-input block w-full" value={form.zone} onChange={e => setForm({ ...form, zone: e.target.value })}><option value="">Chọn khu vực</option>{zones.filter(z => z.active).map(z => <option key={z.id} value={z.id}>{z.name} — phí {z.fee_vnd.toLocaleString('vi-VN')}đ</option>)}</select></label>
        </>}
        <div className="space-y-2">{menu.filter(i => type === 'dine_in' ? i.allow_dine_in : i.allow_delivery).map(i => <label key={i.id} className="flex items-center justify-between gap-3 text-sm"><span>{i.name} · {i.price_vnd.toLocaleString('vi-VN')}đ</span><input aria-label={`Số lượng ${i.name}`} className="elera-input w-20" type="number" min={0} max={99} value={quantities[i.id] || 0} onChange={e => setQuantities({ ...quantities, [i.id]: Number(e.target.value) })} /></label>)}</div>
        <label className="block">Ghi chú<input className="elera-input block w-full" maxLength={1000} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /></label>
      </fieldset>
      <button className="elera-btn-primary" disabled={busy || (loading && !pending)}>{busy ? 'Đang xử lý...' : pending ? 'Kiểm tra / Thử lại yêu cầu' : 'Gửi đơn hàng'}</button>
    </form>
  </div>
}
