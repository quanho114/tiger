import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomePage } from '@/features/restaurant/HomePage';
import { Footer } from '@/app/layout/Footer';
import { useCatalog } from '@/features/catalog';
import type { MenuItem, RestaurantSettings } from '@/features/catalog/types';

vi.mock('@/features/catalog', () => ({ useCatalog: vi.fn() }));
vi.mock('@/features/restaurant/components/HeroSection', () => ({ HeroSection: () => <section aria-label="Màn đầu đã duyệt" /> }));

function dish(id: string, pricing: Partial<MenuItem> = {}): MenuItem {
  return {
    id, name: `Món ${id}`, slug: id, category_id: 'food', description: '',
    price_vnd: 120000, image_path: '', image_url: '', available: true,
    is_available: true, allow_dine_in: true, allow_delivery: true,
    featured_rank: null, is_featured: true, tags: [], serving_size: '',
    pairing_note: '', delivery_eta: '', spice_level: 0, is_signature: false,
    is_bestseller: false, is_new: false, ...pricing,
  };
}

function catalog(items: MenuItem[] = [], settings: RestaurantSettings | null = null) {
  vi.mocked(useCatalog).mockReturnValue({
    items, featuredItems: items, settings, isLoadingMenu: false,
    isLoadingSettings: false, isLoading: false, menuError: null,
  } as ReturnType<typeof useCatalog>);
}

function renderHome() {
  return render(<MemoryRouter><HomePage /></MemoryRouter>);
}

describe('Homepage refresh', () => {
  it('shows catalog prices without turning range, market, or unknown prices into fixed amounts', () => {
    catalog([
      dish('fixed'),
      dish('range', { pricing_mode: 'range', price_min: 280000, price_max: 300000 }),
      dish('market', { pricing_mode: 'market', price_vnd: 0 }),
      dish('unknown', { pricing_mode: 'unknown', price_vnd: 0 }),
    ]);
    renderHome();
    const highlights = screen.getByRole('region', { name: 'Món ngon đáng thử' });
    expect(within(highlights).getByText('120.000 đ')).toBeInTheDocument();
    expect(within(highlights).getByText('280.000 – 300.000 đ')).toBeInTheDocument();
    expect(within(highlights).getByText('Theo thời giá')).toBeInTheDocument();
    expect(within(highlights).getByText('Liên hệ')).toBeInTheDocument();
  });

  it('uses current restaurant settings for the address, hours, and directions', () => {
    catalog([], {
      name: 'Tiger 345', address: 'Địa chỉ kiểm thử', maps_url: 'https://example.test/map',
      business_hours: Array.from({ length: 7 }, (_, weekday) => ({
        id: `${weekday}`, weekday, service_type: 'restaurant', open_time: '10:00:00', close_time: '21:30:00',
      })),
    } as RestaurantSettings);
    renderHome();
    expect(screen.getByText('Địa chỉ kiểm thử')).toBeInTheDocument();
    expect(screen.getByText('10:00 – 21:30')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Chỉ đường/ })).toHaveAttribute('href', 'https://example.test/map');
    expect(screen.getByRole('link', { name: /Đặt bàn/ })).toHaveAttribute('href', '/reservation');
  });

  it('explains missing data and keeps directions available through the location page', () => {
    catalog();
    renderHome();
    expect(screen.getByText('Thực đơn đang được cập nhật.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Chỉ đường/ })).toHaveAttribute('href', '/location');
    expect(screen.getAllByText('Chưa cập nhật')).toHaveLength(2);
    expect(screen.queryByText(/17 Đường Số 1/)).not.toBeInTheDocument();
  });

  it('renders a compact footer without repeating the full navigation and brand story', () => {
    catalog();
    render(<MemoryRouter><Footer compact /></MemoryRouter>);
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.queryByText('Khám Phá')).not.toBeInTheDocument();
    expect(screen.queryByText(/Gìn giữ hương vị Việt/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Lên đầu trang/ })).toBeInTheDocument();
  });
});
