import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PortionPicker, portionPrices } from '../components/PortionPicker';

describe('portion selection', () => {
  it('adds the selected price and quantity instead of the base price', () => {
    const calls: number[][] = [];
    render(<PortionPicker dish={{ id: 'chicken', name: 'Gà', category: 'ga', modes: ['delivery'], image: '', description: '', price: 280000, price_min: 280000, price_max: 300000, pricing_mode: 'range' }} onAdd={(price, quantity) => calls.push([price, quantity])} />);
    fireEvent.click(screen.getByRole('radio', { name: '290.000 đ' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tăng số phần' }));
    fireEvent.click(screen.getByRole('button', { name: 'Thêm vào giỏ hàng' }));
    expect(calls).toEqual([[290000, 2]]);
  });
  it('uses 10k steps for round prices and 5k steps for odd prices', () => {
    expect(portionPrices(280000, 300000)).toEqual([280000, 290000, 300000]);
    expect(portionPrices(285000, 300000)).toEqual([285000, 290000, 295000, 300000]);
    expect(portionPrices(280000, 295000)).toEqual([280000, 285000, 290000, 295000]);
    expect(portionPrices(300000, 280000)).toEqual([]);
  });

  it('updates the total when choosing a price and changing quantity', () => {
    render(<PortionPicker dish={{ id: 'chicken', name: 'Gà', category: 'ga', modes: ['dine-in'], image: '', description: '', price: 280000, price_min: 280000, price_max: 300000, pricing_mode: 'range' }} />);
    fireEvent.click(screen.getByRole('radio', { name: '290.000 đ' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tăng số phần' }));
    expect(screen.getByLabelText('Tổng tiền phần đã chọn').textContent).toBe('580.000 đ');
    fireEvent.click(screen.getByRole('button', { name: 'Giảm số phần' }));
    expect(screen.getByRole('button', { name: 'Giảm số phần' })).toBeDisabled();
  });
});
