import { useEffect, useRef } from 'react'
import type { ConciergeV2Draft, ConciergeV2DraftOperation } from '@contracts/concierge-v2'

export function DraftCartReview({ draft, names, busy, onEdit, onReview, onAcceptPrices, onHandoff }: {
  draft: ConciergeV2Draft; names: Record<string, string>; busy: boolean;
  onEdit: (operation: ConciergeV2DraftOperation) => void; onReview: () => void;
  onAcceptPrices: () => void; onHandoff: () => void
}) {
  const title = useRef<HTMLHeadingElement>(null)
  useEffect(() => { title.current?.focus() }, [])
  const button = 'rounded-lg border border-[#173866] px-3 py-2 text-[#173866] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50'
  return <section id="concierge-draft-review" aria-labelledby="concierge-draft-title" className="p-3 max-h-[40vh] overflow-auto bg-white border-t text-sm">
    <h4 id="concierge-draft-title" ref={title} tabIndex={-1} className="font-bold">Món đã chọn</h4>
    {!draft.items.length && <p>Giỏ nháp đang trống.</p>}
    <ul className="space-y-3 my-3">{draft.items.map(item => <li key={item.line_id} className="border-b pb-2">
      <p className="font-medium break-words">{names[item.menu_item_id] ?? 'Món đã chọn'}</p>
      <p>{item.unit_price_vnd.toLocaleString('vi-VN')} đ / phần</p>
      {item.note && <p>Ghi chú: {item.note}</p>}
      <label className="inline-flex items-center gap-2">Số lượng
        <input aria-label={`Số lượng ${names[item.menu_item_id] ?? 'món'}`} type="number" min={1} max={99} value={item.quantity}
          disabled={busy || Boolean(draft.exported_version)} className="w-16 rounded border p-2"
          onChange={event => { const quantity = Number(event.target.value); if (Number.isInteger(quantity) && quantity >= 1 && quantity <= 99) onEdit({ type: 'set_quantity', line_id: item.line_id, quantity }) }} />
      </label>
      <button className={`${button} ml-2`} disabled={busy || Boolean(draft.exported_version)} onClick={() => onEdit({ type: 'remove_item', line_id: item.line_id })}>Bỏ món</button>
      {draft.blocked_items.filter(block => block.line_id === item.line_id).map(block => <p role="alert" key={block.reason} className="text-red-800">{block.message}</p>)}
    </li>)}</ul>
    <p aria-live="polite">Tạm tính: {draft.subtotal_vnd.toLocaleString('vi-VN')} đ</p>
    <p className="my-2 text-xs">Chuyển món sẽ cộng vào giỏ hàng hiện có, giữ nguyên các món và ghi chú cũ. Bạn xác nhận đặt món ở bước thanh toán.</p>
    {draft.exported_version ? <button className={button} disabled={busy} onClick={() => onEdit({ type: 'start_new_set' })}>Bắt đầu mâm mới</button> : <div className="flex flex-wrap gap-2">
      {draft.blocked_items.some(block => block.reason === 'PRICE_CHANGED') && <button className={button} disabled={busy} onClick={onAcceptPrices}>Đồng ý giá mới</button>}
      {draft.review_state === 'ready_for_review' ? <button className={button} disabled={busy || Boolean(draft.blocked_items.length)} onClick={onHandoff}>Chuyển vào giỏ hàng</button> :
        <button className={button} disabled={busy || !draft.items.length} onClick={onReview}>Xem & chỉnh sửa đơn</button>}
    </div>}
  </section>
}
