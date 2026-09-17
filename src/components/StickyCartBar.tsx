import type { FC } from 'react';
import { ArrowRight } from 'lucide-react';
import { useCart } from '../store/cart';

/**
 * Sticky bottom cart bar.
 * Mobile: full-width transactional bar `[ N món ]  price  Xem giỏ →`.
 * Desktop: keeps the approved floating pill.
 */
export const StickyCartBar: FC = () => {
  const { totalCount, subtotal, isCartOpen, setCartOpen } = useCart();

  if (totalCount === 0 || isCartOpen) return null;

  const distinctNote = `${totalCount} món`;

  return (
    <div
      className="fixed z-40 inset-x-3 bottom-3 md:inset-x-auto md:left-1/2 md:right-auto md:-translate-x-1/2 md:bottom-6 md:w-[90%] md:max-w-md animate-in slide-in-from-bottom-6 duration-300"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <button
        type="button"
        onClick={() => setCartOpen(true)}
        className="w-full bg-[#ed7328] hover:bg-[#d86218] text-white pl-4 pr-4 md:p-4 py-3.5 rounded-2xl md:rounded-full shadow-2xl flex items-center justify-between gap-3 border-2 border-white/80 transition-all active:scale-[0.99] md:hover:scale-[1.02]"
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <span className="min-w-8 h-8 px-2 rounded-full bg-white/20 flex items-center justify-center font-semibold text-xs shrink-0">
            {totalCount}
          </span>
          <span className="font-semibold text-sm truncate">{distinctNote}</span>
        </span>
        <span className="flex items-center gap-2 font-['Be_Vietnam_Pro',sans-serif] font-semibold text-sm shrink-0">
          <span>{subtotal.toLocaleString('vi-VN')} đ</span>
          <span className="hidden min-[380px]:inline text-white/85 font-normal text-xs">·</span>
          <span className="inline-flex items-center gap-1 text-sm">
            Xem giỏ <ArrowRight size={16} />
          </span>
        </span>
      </button>
    </div>
  );
};
