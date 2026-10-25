import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { MenuItem } from '../legacyMenuItem';

export function portionPrices(min: number, max: number): number[] {
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min < 0 || max < min) return [];
  const step = min % 10000 === 0 && max % 10000 === 0 ? 10000 : 5000;
  const prices: number[] = [];
  for (let price = min; price <= max; price += step) prices.push(price);
  if (prices.at(-1) !== max) prices.push(max);
  return prices;
}

const money = (value: number) => `${value.toLocaleString('vi-VN')} đ`;

export function PortionPicker({ dish, onAdd, addLabel = 'Thêm vào giỏ hàng' }: { dish: MenuItem; onAdd?: (price: number, quantity: number) => void; addLabel?: string }) {
  const prices = portionPrices(dish.price_min ?? dish.price, dish.price_max ?? dish.price);
  const [price, setPrice] = useState(prices[0] ?? 0);
  const [quantity, setQuantity] = useState(1);
  if (!prices.length) return <p>Chưa có mức giá phù hợp. Vui lòng liên hệ nhân viên.</p>;

  return (
    <fieldset disabled={dish.available === false} className="space-y-3 disabled:opacity-50">
      <legend className="mb-2 text-sm font-semibold text-deep-indigo">Chọn giá mỗi phần</legend>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(80px,1fr))] gap-2" role="radiogroup" aria-label="Giá mỗi phần">
        {prices.map(value => (
          <button key={value} type="button" role="radio" aria-checked={price === value}
            onClick={() => setPrice(value)}
            className={`min-h-11 rounded-xl border px-2 text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-deep-indigo ${price === value ? 'border-burnt-orange bg-burnt-orange text-white' : 'border-deep-indigo/20 text-deep-indigo'}`}>
            {money(value)}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-deep-indigo">Số lượng phần</span>
        <div className="flex items-center gap-0">
          <button type="button" aria-label="Giảm số phần" disabled={quantity === 1} onClick={() => setQuantity(q => q - 1)} className="flex size-11 items-center justify-center disabled:opacity-30"><span className="flex size-8 items-center justify-center rounded-full border border-deep-indigo/20"><Minus size={14} /></span></button>
          <output aria-label="Số phần" className="min-w-6 text-center font-semibold tabular-nums">{quantity}</output>
          <button type="button" aria-label="Tăng số phần" disabled={quantity >= 99} onClick={() => setQuantity(q => q + 1)} className="flex size-11 items-center justify-center disabled:opacity-30"><span className="flex size-8 items-center justify-center rounded-full bg-burnt-orange text-white"><Plus size={14} /></span></button>
        </div>
      </div>
      <p aria-live="polite" className="flex justify-between gap-3 border-t border-deep-indigo/10 pt-3 text-sm font-semibold text-deep-indigo"><span>Tổng tiền ({quantity} phần)</span><output aria-label="Tổng tiền phần đã chọn">{money(price * quantity)}</output></p>
      {onAdd && <button type="button" onClick={() => onAdd(price, quantity)} className="min-h-11 w-full rounded-full bg-[#4f6958] px-5 text-sm font-semibold text-white hover:bg-[#425b4b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4f6958]">{addLabel}</button>}
    </fieldset>
  );
}
