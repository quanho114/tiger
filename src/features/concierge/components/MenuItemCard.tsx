import type { FC } from 'react'
import { Plus, Sparkles, Check, X } from 'lucide-react'
import type { MenuItemCardData } from '../types'

interface MenuItemCardProps {
  item: MenuItemCardData
  onAddSingleItem?: (item: MenuItemCardData) => void
}

export const MenuItemCard: FC<MenuItemCardProps> = ({ item, onAddSingleItem }) => {
  return (
    <div className="bg-white rounded-xl border border-stone-200/80 p-3.5 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <h5 className="font-bold text-sm text-stone-900 truncate">{item.name}</h5>
          {item.is_signature && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900">
              <Sparkles className="w-2.5 h-2.5" />
              Signature
            </span>
          )}
        </div>
        <p className="text-xs text-stone-600 line-clamp-2">{item.description}</p>
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <span className="font-extrabold text-sm text-[#234386]">
            {item.price_vnd.toLocaleString('vi-VN')} đ
          </span>
          {item.serving_size && (
            <span className="text-[11px] text-stone-500">· {item.serving_size}</span>
          )}
          {item.is_available ? (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-700">
              <Check className="w-2.5 h-2.5" /> Sẵn sàng
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-rose-600">
              <X className="w-2.5 h-2.5" /> Tạm hết
            </span>
          )}
        </div>
      </div>

      {onAddSingleItem && (
        <button
          type="button"
          onClick={() => onAddSingleItem(item)}
          disabled={!item.is_available}
          className={`flex-shrink-0 p-2 rounded-lg border transition-colors ${
            item.is_available
              ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 active:scale-95'
              : 'border-stone-200 bg-stone-100 text-stone-400 cursor-not-allowed'
          }`}
          title={item.is_available ? 'Thêm vào giỏ' : 'Món tạm hết'}
        >
          <Plus className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
