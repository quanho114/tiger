import { useEffect, useState, type FC, type FormEvent } from 'react'
import { adminApi } from '@/shared/lib/api/client'
import { useAuth } from '../../auth'
import { useAdmin } from '../layout/AdminContext'
import { AdminLoading } from '../components/AdminLoading'

interface Account { id: string; name: string; email: string; active: boolean; last_sign_in_at: string | null }

export const AdminAccountsPage: FC = () => {
  const { user } = useAuth()
  const { refreshKey, triggerRefresh } = useAdmin()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  useEffect(() => {
    let active = true
    void adminApi.get<{ items: Account[] }>('/accounts').then(res => {
      if (active) { setAccounts(res.data.items); setError(null) }
    }).catch(err => { if (active) setError(err instanceof Error ? err.message : 'Không thể tải tài khoản') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [refreshKey])
  const toggle = async (account: Account) => {
    if (busy) return
    setBusy(true); setError(null)
    try {
      await adminApi.patch(`/accounts/${account.id}`, { active: !account.active })
      triggerRefresh()
    } catch (err) { setError(err instanceof Error ? err.message : 'Không thể cập nhật tài khoản') }
    finally { setBusy(false) }
  }
  const create = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError(null)
    try {
      await adminApi.post('/accounts', form)
      setForm({ name: '', email: '', password: '' }); setShowForm(false); triggerRefresh()
    } catch (err) { setError(err instanceof Error ? err.message : 'Không thể tạo tài khoản') }
    finally { setBusy(false) }
  }
  return <div className="space-y-6 max-w-7xl mx-auto">
    <div className="flex justify-between gap-4"><h1 className="text-xl font-bold">Tài khoản Quản trị & Nhân sự</h1>
      <button className="elera-btn-primary" onClick={() => setShowForm(true)}>Thêm tài khoản admin</button></div>
    <p className="text-sm text-slate-500">Các tài khoản admin có toàn quyền quản trị. Khóa tài khoản sẽ chặn các yêu cầu quản trị tiếp theo. Không thể tự khóa tài khoản đang sử dụng.</p>
    {error && <p role="alert" className="text-rose-600">{error}</p>}
    {showForm && <form onSubmit={create} className="bg-white border border-slate-200 p-5 rounded-xl space-y-4">
      <h2 className="font-semibold">Tạo tài khoản đăng nhập</h2>
      <label className="block">Họ tên<input className="elera-input block w-full" required minLength={2} maxLength={100} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
      <label className="block">Email<input className="elera-input block w-full" type="email" required autoComplete="off" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
      <label className="block">Mật khẩu (ít nhất 12 ký tự)<input className="elera-input block w-full" type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></label>
      <div className="flex gap-2"><button className="elera-btn-primary" disabled={busy}>Tạo tài khoản</button><button type="button" className="elera-btn-secondary" disabled={busy} onClick={() => { setShowForm(false); setForm({ name: '', email: '', password: '' }) }}>Hủy</button></div>
    </form>}
    {loading ? <AdminLoading variant="block" label="Đang tải tài khoản..." /> : <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
      <table className="w-full text-sm text-left"><thead><tr><th className="p-4">Tài khoản</th><th>Email</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
        <tbody>{accounts.map(account => <tr key={account.id} className="border-t border-slate-100">
          <td className="p-4">{account.name}</td><td>{account.email}</td><td>{account.active ? 'Đang hoạt động' : 'Đã khóa'}</td>
          <td><button className="elera-btn-secondary" disabled={busy || account.id === user?.id} onClick={() => void toggle(account)}>{account.active ? 'Khóa' : 'Mở khóa'}</button></td>
        </tr>)}</tbody>
      </table>
    </div>}
  </div>
}
