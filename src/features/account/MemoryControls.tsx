import { useEffect, useRef, useState } from 'react'
import { customerApi } from '@/shared/lib/api/client'
import type { ConciergeV2MemoryFact, ConciergeV2MemorySettings, ConciergeV2BehavioralMemorySelector } from '@contracts/concierge-v2'

type MemoryData = { settings: ConciergeV2MemorySettings; facts: ConciergeV2MemoryFact[]; suppressions?: ConciergeV2BehavioralMemorySelector[] }
export function MemoryControls() {
  const [data, setData] = useState<MemoryData | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [food, setFood] = useState('')
  const alive = useRef(true)
  const lock = useRef(false)
  const requests = useRef<AbortController | null>(null)
  useEffect(() => {
    alive.current = true
    const controller = new AbortController()
    requests.current = controller
    customerApi.get<MemoryData>('/me/ai-memory', { signal: controller.signal })
      .then(response => { if (alive.current) setData(response.data) })
      .catch(() => { if (alive.current) setError('Không thể tải cài đặt ký ức.') })
    return () => { alive.current = false; controller.abort() }
  }, [])
  async function change(path: string, body: unknown, method: 'put' | 'post' = 'post') {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      const signal = requests.current?.signal
      await customerApi[method](`/me/ai-memory/${path}`, body, { signal })
      if (!alive.current || signal?.aborted) return
      const response = await customerApi.get<MemoryData>('/me/ai-memory', { signal })
      if (alive.current) { setData(response.data); setEditing(null) }
    } catch { if (alive.current) setError('Không thể cập nhật ký ức. Vui lòng thử lại.') }
    finally { lock.current = false; if (alive.current) setBusy(false) }
  }
  const selector = (fact: ConciergeV2MemoryFact) => ({ memory_type: fact.memory_type, memory_key: fact.memory_key, source: fact.source, expected_memory_epoch: data!.settings.memory_epoch })
  const button = 'rounded-lg border border-slate-300 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-blue-900 disabled:opacity-50'
  return <section aria-labelledby="memory-title" className="my-6 rounded-2xl border border-stone-200 bg-white p-5">
    <h2 id="memory-title" className="font-semibold text-lg text-[#173866]">Ký ức ẩm thực</h2>
    <p className="my-2 text-sm text-slate-700">Mỗi lần tải trang là một cuộc trò chuyện mới. Nếu bạn đồng ý, trợ lý chỉ nhớ sở thích, món không thích và nguyên liệu gây dị ứng; không lưu lịch sử chat. Dị ứng vẫn được dùng trong phiên khi tắt ký ức.</p>
    {error && <p role="alert" className="text-red-800">{error}</p>}
    {!data && !error && <p role="status">Đang tải cài đặt...</p>}
    {data && <>
      <label className="flex gap-2 my-3"><input type="checkbox" checked={data.settings.enabled} disabled={busy}
        onChange={e => change('settings', { enabled: e.target.checked, consent_version: 1 }, 'put')} />Cho phép nhớ sở thích ẩm thực</label>
      <p className="text-xs text-slate-600">Tắt hoặc “Quên tất cả” sẽ xóa ký ức và dừng học cho đến khi bạn bật lại.</p>
      <ul className="my-3 space-y-3">{data.facts.map(fact => <li key={fact.id} className="border-b pb-3">
        <p>{fact.memory_type === 'allergy' ? 'Dị ứng' : fact.memory_type === 'dislike' ? 'Không thích' : 'Yêu thích'}: <strong>{fact.value.food}</strong></p>
        <p className="text-xs text-slate-600">{fact.source === 'explicit' ? 'Bạn chủ động cung cấp' : 'Từ đơn hàng đã hoàn tất'}</p>
        {editing === fact.id ? <form className="flex flex-wrap gap-2 mt-2" onSubmit={event => { event.preventDefault(); void change('edit', { selector: selector(fact), food }, 'put') }}>
          <label>Tên món hoặc nguyên liệu<input autoFocus required maxLength={120} value={food} onChange={event => setFood(event.target.value)} className="block border rounded p-2" /></label>
          <button disabled={busy} className={button} type="submit">Lưu thay đổi</button>
          <button type="button" className={button} onClick={() => setEditing(null)}>Hủy</button>
        </form> : <div className="flex gap-2 mt-2">
          <button className={button} disabled={busy} onClick={() => { setEditing(fact.id); setFood(fact.value.food) }}>Sửa</button>
          <button className={button} disabled={busy} onClick={() => change('delete', selector(fact))}>Quên mục này</button>
        </div>}
      </li>)}</ul>
      {!data.facts.length && <p className="text-sm my-3">Chưa có ký ức nào.</p>}
      {!!data.suppressions?.length && <div className="my-3">
        <h3 className="font-semibold">Đã ngừng ghi nhớ từ đơn hàng</h3>
        <p className="text-sm">Chỉ học lại các mục này khi bạn cho phép và ký ức đang bật.</p>
        <ul>{data.suppressions.map(item => <li key={`${item.memory_type}:${item.memory_key}`} className="flex gap-2 items-center my-2">
          <span>{item.memory_key.replace(/[-_]/g, ' ')}</span>
          <button className={button} disabled={busy || !data.settings.enabled} onClick={() => change('restore', item)}>Cho phép học lại</button>
        </li>)}</ul>
      </div>}
      <button className={button} disabled={busy} onClick={() => change('forget', {})}>Quên tất cả</button>
      <p role="status" aria-live="polite" className="text-sm mt-2">{busy ? 'Đang cập nhật...' : data.settings.enabled ? 'Ký ức đang bật.' : 'Ký ức đang tắt.'}</p>
    </>}
  </section>
}
