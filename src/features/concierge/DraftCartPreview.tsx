import type { ConciergeV2Draft } from '@contracts/concierge-v2'

export function DraftCartPreview({ draft, expanded, onToggle }: { draft: ConciergeV2Draft; expanded: boolean; onToggle: () => void }) {
  return <button type="button" aria-expanded={expanded} aria-controls="concierge-draft-review" onClick={onToggle}
    className="w-full px-4 py-3 bg-amber-50 text-[#173866] border-t border-amber-200 text-left focus-visible:outline-2 focus-visible:outline-[#173866]">
    <strong>Giỏ nháp · {draft.items.reduce((sum, item) => sum + item.quantity, 0)} phần</strong>
    <span className="float-right">{draft.subtotal_vnd.toLocaleString('vi-VN')} đ</span>
    <span className="block text-xs">{draft.exported_version ? 'Đã chuyển vào giỏ hàng' : 'Chỉ gồm món bạn đã chọn · Chưa đặt món'}</span>
  </button>
}
