// Tiger Admin — AI draft diff review (web-only).
// Drafts never self-apply; admin picks sections, allergens stay review-only.
import { useState } from 'react'
import type { AcceptDraftResult, AiDraft } from '../types'
import { acceptDraft, buildAcceptOnly, generateDraft, listDrafts, rejectDraft } from '../api'

interface Props {
  itemId: string
  itemName: string
  current: { mealRole: string; serving: string; spice: string; taste: string; pairing: string }
  onApplied: () => Promise<void>
  notify: (text: string, type: 'success' | 'error') => void
}

function Row({ label, current, suggested }: { label: string; current: string; suggested: string }) {
  const changed = current !== suggested
  return (
    <div className="grid grid-cols-3 gap-2 border-b border-[#f0f1f0] py-2 text-sm last:border-0">
      <span className="font-semibold text-[#5c5e5c]">{label}</span>
      <span className="text-[#787979]">{current || '—'}</span>
      <span className={changed ? 'font-semibold text-[#171a17]' : 'text-[#787979]'}>
        {suggested || '—'}
        {changed && (
          <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-800">
            MỚI
          </span>
        )}
      </span>
    </div>
  )
}

export function DraftReview({ itemId, itemName, current, onApplied, notify }: Props) {
  const [drafts, setDrafts] = useState<AiDraft[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [isWorking, setIsWorking] = useState(false)
  const [wantServing, setWantServing] = useState(true)
  const [wantTaste, setWantTaste] = useState(true)
  const [lastResult, setLastResult] = useState<AcceptDraftResult | null>(null)

  const active = drafts.find((d) => d.id === activeId) ?? null

  const refresh = async () => {
    try {
      const list = await listDrafts(itemId)
      setDrafts(list.filter((d) => d.status === 'pending'))
      if (list.length && !activeId) setActiveId(list[0].id)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Không tải được bản nháp', 'error')
    }
  }

  const generate = async () => {
    setIsWorking(true)
    setLastResult(null)
    try {
      const draft = await generateDraft(itemId)
      setDrafts((prev) => [draft, ...prev])
      setActiveId(draft.id)
      setWantServing(true)
      setWantTaste(true)
      notify('Đã tạo gợi ý AI (chưa áp dụng)', 'success')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Tạo gợi ý thất bại', 'error')
    } finally {
      setIsWorking(false)
    }
  }

  const accept = async () => {
    if (!active) return
    const only = buildAcceptOnly(wantServing, wantTaste)
    if (only === null) {
      notify('Hãy chọn ít nhất một phần để áp dụng', 'error')
      return
    }
    setIsWorking(true)
    try {
      const result = await acceptDraft(active.id, only)
      setLastResult(result)
      setDrafts((prev) => prev.filter((d) => d.id !== active.id))
      setActiveId(null)
      notify('Đã áp dụng các phần đã chọn', 'success')
      await onApplied()
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Áp dụng thất bại', 'error')
    } finally {
      setIsWorking(false)
    }
  }

  const reject = async () => {
    if (!active) return
    setIsWorking(true)
    try {
      await rejectDraft(active.id)
      setDrafts((prev) => prev.filter((d) => d.id !== active.id))
      setActiveId(null)
      notify('Đã từ chối bản nháp', 'success')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Từ chối thất bại', 'error')
    } finally {
      setIsWorking(false)
    }
  }

  const payload = active?.payload
  const people = (d?: AiDraft['payload']) =>
    d?.people_min != null || d?.people_max != null
      ? `${d?.people_min ?? '?'}–${d?.people_max ?? '?'} người`
      : ''

  return (
    <div className="rounded-xl border border-[#e2e3e3] bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-[#171a17]">Gợi ý AI cho “{itemName}”</h3>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-lg border border-[#e2e3e3] px-3 py-1.5 text-xs font-semibold"
            disabled={isWorking}
            onClick={() => void refresh()}
          >
            Xem lại
          </button>
          <button
            type="button"
            className="rounded-lg bg-[#2b2e2c] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            disabled={isWorking}
            onClick={() => void generate()}
          >
            {isWorking ? 'Đang tạo…' : 'Tạo gợi ý AI'}
          </button>
        </div>
      </div>

      {drafts.length > 1 && (
        <select
          aria-label="Chọn bản nháp"
          className="mt-3 w-full rounded-lg border border-[#e2e3e3] px-2 py-1.5 text-sm"
          value={activeId ?? ''}
          onChange={(e) => setActiveId(e.target.value)}
        >
          {drafts.map((d) => (
            <option key={d.id} value={d.id}>
              {new Date(d.created_at).toLocaleString('vi-VN')} — {d.model ?? d.provider ?? 'AI'}
            </option>
          ))}
        </select>
      )}

      {payload && (
        <div className="mt-3">
          <div className="grid grid-cols-3 gap-2 pb-1 text-[11px] font-bold uppercase text-[#787979]">
            <span>Trường</span>
            <span>Hiện tại</span>
            <span>AI gợi ý</span>
          </div>
          <Row label="Vai trò món" current={current.mealRole} suggested={payload.meal_role ?? ''} />
          <Row label="Khẩu phần" current={current.serving} suggested={people(payload)} />
          <Row
            label="Độ cay"
            current={current.spice}
            suggested={payload.spice_level != null ? String(payload.spice_level) : ''}
          />
          <Row label="Thẻ vị" current={current.taste} suggested={(payload.taste_tags ?? []).join(', ')} />
          <Row label="Ghép món" current={current.pairing} suggested={(payload.pairing_names ?? []).join(', ')} />
          <div className="grid grid-cols-3 gap-2 border-b border-[#f0f1f0] py-2 text-sm">
            <span className="font-semibold text-[#5c5e5c]">Dị ứng có thể</span>
            <span className="text-[#787979]">—</span>
            <span>
              {(payload.possible_allergens_for_review ?? []).join(', ') || '—'}
              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                CHỈ XEM XÉT
              </span>
            </span>
          </div>

          <div className="mt-3 space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={wantServing} onChange={(e) => setWantServing(e.target.checked)} />
              Áp dụng phần khẩu phần & vai trò
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={wantTaste} onChange={(e) => setWantTaste(e.target.checked)} />
              Áp dụng phần vị & ghép món
            </label>
            <label className="flex items-center gap-2 opacity-60">
              <input type="checkbox" disabled checked={false} />
              Ứng viên dị ứng (không bao giờ tự áp dụng — cần bếp xác minh riêng)
            </label>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="rounded-lg bg-[#2b2e2c] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={isWorking}
              onClick={() => void accept()}
            >
              Chấp nhận phần đã chọn
            </button>
            <button
              type="button"
              className="rounded-lg border border-[#e2e3e3] px-4 py-2 text-sm font-semibold disabled:opacity-50"
              disabled={isWorking}
              onClick={() => void reject()}
            >
              Từ chối
            </button>
          </div>
        </div>
      )}

      {lastResult && (
        <div className="mt-3 rounded-lg bg-green-50 p-3 text-xs text-green-900">
          <p className="font-bold">Kết quả áp dụng</p>
          <ul className="mt-1 list-disc pl-4">
            <li>Khẩu phần: {lastResult.appliedServing ? 'đã áp dụng' : 'bỏ qua'}</li>
            <li>Vị & ghép món: {lastResult.appliedTaste ? 'đã áp dụng' : 'bỏ qua'}</li>
            {lastResult.droppedPairings.length > 0 && (
              <li>Món ghép bị loại: {lastResult.droppedPairings.join(', ')}</li>
            )}
            {lastResult.rejectedTasteTags.length > 0 && (
              <li>Thẻ vị bị loại: {lastResult.rejectedTasteTags.join(', ')}</li>
            )}
            {lastResult.allergenCandidatesNoted.length > 0 && (
              <li>Ứng viên dị ứng đã ghi nhận xét (chưa xác minh): {lastResult.allergenCandidatesNoted.join(', ')}</li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
