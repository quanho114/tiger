import { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CartDrawer, type CartItem } from '@/features/ordering/checkout/CartDrawer';
import { CartProvider } from '@/features/cart';
import { TableSessionProvider } from '@/features/table-session';
import { AuthContext, type AuthState } from '@/features/auth/AuthContext';
import type { MenuItem } from '@/features/catalog/legacyMenuItem';
import * as deliveryApi from '@/features/ordering/delivery/api';

vi.mock('@/features/ordering/delivery/api', () => ({
  requestDeliveryQuote: vi.fn(),
  submitDeliveryOrder: vi.fn(),
}));

const mockGuestAuthState: AuthState = {
  user: null,
  session: null,
  role: 'guest',
  customerProfile: null,
  adminProfile: null,
  isLoading: false,
  error: null,
  signOut: vi.fn(),
  refreshSession: vi.fn(),
};

function renderCartDrawer(props: any, Component = CartDrawer) {
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={mockGuestAuthState}>
        <TableSessionProvider>
          <CartProvider>
            <Component {...props} />
          </CartProvider>
        </TableSessionProvider>
      </AuthContext.Provider>
    </MemoryRouter>
  );
}

const mockDish: MenuItem = {
  id: 'dish-1',
  name: 'Gà Hấp Nước Mắm Nhĩ',
  price: 240000,
  category: 'mon-chinh',
  description: 'Gà thả vườn hấp mắm nhĩ thơm lừng',
  image: 'https://images.unsplash.com/photo-1?w=500',
  isSignature: true,
  modes: ['dine-in', 'delivery'],
};

const mockCartItems: CartItem[] = [
  {
    dish: mockDish,
    quantity: 2,
  },
];

describe('CartDrawer Component', () => {
  it.each([false, true])('animates only when the final item is removed, respecting reduced motion: %s', reduced => {
    const animate = vi.fn(() => ({ cancel: vi.fn() }));
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
    const originalMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({ matches: reduced })) });
    function StatefulCart(props: Parameters<typeof CartDrawer>[0]) {
      const [items, setItems] = useState(mockCartItems);
      return <CartDrawer {...props} cartItems={items} onRemoveItem={() => setItems([])} />;
    }
    try {
      renderCartDrawer({ isOpen: true, onClose: vi.fn(), cartItems: mockCartItems, onUpdateQuantity: vi.fn(), onRemoveItem: vi.fn(), onClearCart: vi.fn() }, StatefulCart);
      expect(animate).not.toHaveBeenCalled();
      fireEvent.click(screen.getByLabelText(/^Xóa món khỏi giỏ:/));
      expect(screen.getByText('Giỏ hàng của bạn đang trống')).toBeInTheDocument();
      expect(animate).toHaveBeenCalledTimes(reduced ? 0 : 1);
    } finally {
      if (originalMedia) Object.defineProperty(window, 'matchMedia', originalMedia);
      else delete (window as unknown as { matchMedia?: unknown }).matchMedia;
      delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate;
    }
  });

  it('is completely unmounted from DOM and accessibility tree when isOpen is false (fixes tabbable bug)', () => {
    renderCartDrawer({
      isOpen: false,
      onClose: vi.fn(),
      cartItems: mockCartItems,
      onUpdateQuantity: vi.fn(),
      onRemoveItem: vi.fn(),
      onClearCart: vi.fn(),
    });

    // Dialog must not exist in DOM
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByTestId('cart-drawer-backdrop')).toBeNull();
    // Buttons inside cart must not exist
    expect(screen.queryByLabelText('Đóng giỏ hàng')).toBeNull();
  });

  it('renders correctly with role="dialog" and aria-modal="true" when isOpen is true', () => {
    renderCartDrawer({
      isOpen: true,
      onClose: vi.fn(),
      cartItems: mockCartItems,
      onUpdateQuantity: vi.fn(),
      onRemoveItem: vi.fn(),
      onClearCart: vi.fn(),
    });

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Gà Hấp Nước Mắm Nhĩ')).toBeInTheDocument();
  });

  it('groups removals from minus-at-one and trash into a single undo action', () => {
    const restore = vi.fn();
    const remove = vi.fn();
    const first = { ...mockCartItems[0], quantity: 1, note: 'Giá phần: 290.000 đ' };
    const second = { ...mockCartItems[0], dish: { ...mockCartItems[0].dish, id: 'dish-2', name: 'Món thứ hai' }, quantity: 3 };
    renderCartDrawer({ isOpen: true, onClose: vi.fn(), cartItems: [first, second], onUpdateQuantity: vi.fn(), onRemoveItem: remove, onRestoreItem: restore, onClearCart: vi.fn() });
    fireEvent.click(screen.getAllByLabelText('Giảm số lượng')[0]);
    expect(remove).toHaveBeenCalledWith(first.dish.id, first.note);
    fireEvent.click(screen.getAllByLabelText(/^Xóa món khỏi giỏ:/)[1]);
    expect(screen.getByRole('status')).toHaveTextContent('Đã bỏ 2 món');
    fireEvent.click(screen.getByRole('button', { name: 'Hoàn tác tất cả' }));
    expect(restore.mock.calls).toEqual([[first], [second]]);
    expect(screen.queryByText('Hoàn tác tất cả')).not.toBeInTheDocument();
  });

  it('fires onUpdateQuantity and onRemoveItem appropriately', () => {
    const onUpdateQuantity = vi.fn();
    const onRemoveItem = vi.fn();

    renderCartDrawer({
      isOpen: true,
      onClose: vi.fn(),
      cartItems: mockCartItems,
      onUpdateQuantity,
      onRemoveItem,
      onClearCart: vi.fn(),
    });

    const plusBtn = screen.getByLabelText('Tăng số lượng');
    fireEvent.click(plusBtn);
    expect(onUpdateQuantity).toHaveBeenCalledWith('dish-1', 1);

    const minusBtn = screen.getByLabelText('Giảm số lượng');
    fireEvent.click(minusBtn);
    expect(onUpdateQuantity).toHaveBeenCalledWith('dish-1', -1);

    const removeBtn = screen.getByLabelText(/^Xóa món khỏi giỏ:/);
    fireEvent.click(removeBtn);
    expect(onRemoveItem).toHaveBeenCalledWith('dish-1');
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates delivery form fields when user clicks Xem bảng giá & Phí giao hàng without input', async () => {
    renderCartDrawer({
      isOpen: true,
      onClose: vi.fn(),
      cartItems: mockCartItems,
      onUpdateQuantity: vi.fn(),
      onRemoveItem: vi.fn(),
      onClearCart: vi.fn(),
    });

    const quoteBtn = screen.getByText('Xem bảng giá & Phí giao hàng');
    fireEvent.click(quoteBtn);

    expect(deliveryApi.requestDeliveryQuote).not.toHaveBeenCalled();
    expect(screen.getByText('Vui lòng nhập họ và tên của bạn.')).toBeInTheDocument();
    expect(screen.getByText('Vui lòng nhập số điện thoại liên hệ.')).toBeInTheDocument();
  });

  it('executes two-stage delivery checkout: quote breakdown review followed by order submission and receipt', async () => {
    const onClearCart = vi.fn();
    const mockQuoteRes = {
      quote_token: 'signed-deliv-quote-token-xyz',
      subtotal_vnd: 480000,
      shipping_fee_vnd: 0,
      total_vnd: 480000,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      zone: {
        id: '40000000-0000-0000-0000-000000000001',
        name: 'Nội ô Thị trấn Vĩnh An (< 3km)',
        fee_vnd: 15000,
        free_threshold_vnd: 200000,
      },
      items: [
        {
          menu_item_id: 'dish-1',
          item_name: 'Gà Hấp Nước Mắm Nhĩ',
          quantity: 2,
          unit_price_vnd: 240000,
          line_total_vnd: 480000,
        },
      ],
    };

    const mockReceipt = {
      id: 'deliv-order-123',
      code: 'TG-DELIV-123',
      order_type: 'delivery' as const,
      status: 'pending' as const,
      payment_status: 'unpaid' as const,
      customer_name: 'Nguyễn Văn A',
      customer_phone: '0902809929',
      address: '17 Đường Số 1, Vĩnh An, Đồng Nai',
      zone_name: 'Nội ô Thị trấn Vĩnh An (< 3km)',
      subtotal_vnd: 480000,
      shipping_fee_vnd: 0,
      total_vnd: 480000,
      created_at: new Date().toISOString(),
    };

    vi.mocked(deliveryApi.requestDeliveryQuote).mockResolvedValueOnce(mockQuoteRes);
    vi.mocked(deliveryApi.submitDeliveryOrder).mockResolvedValueOnce(mockReceipt);

    renderCartDrawer({
      isOpen: true,
      onClose: vi.fn(),
      cartItems: mockCartItems,
      onUpdateQuantity: vi.fn(),
      onRemoveItem: vi.fn(),
      onClearCart,
    });

    // 1. Fill delivery form
    fireEvent.change(screen.getByPlaceholderText('Ví dụ: Nguyễn Văn A'), {
      target: { value: 'Nguyễn Văn A' },
    });
    fireEvent.change(screen.getByPlaceholderText('Ví dụ: 090 280 99 29'), {
      target: { value: '0902809929' },
    });
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: '40000000-0000-0000-0000-000000000001' },
    });
    fireEvent.change(screen.getByPlaceholderText('Số nhà, tên đường, khu phố...'), {
      target: { value: '17 Đường Số 1, Vĩnh An, Đồng Nai' },
    });

    // 2. Request Quote
    const quoteBtn = screen.getByText('Xem bảng giá & Phí giao hàng');
    fireEvent.click(quoteBtn);

    // 3. Verify Quote review card appears
    await waitFor(() => {
      expect(screen.getByText('Bảng Giá Giao Hàng Xác Nhận')).toBeInTheDocument();
    });
    expect(screen.getByText('Hiệu lực trong 5 phút')).toBeInTheDocument();
    expect(screen.getByText('Thông tin nhận món')).toBeInTheDocument();
    expect(screen.getByText('Xác nhận đặt giao ngay')).toBeInTheDocument();

    // 4. Confirm and Submit Order
    const confirmBtn = screen.getByText('Xác nhận đặt giao ngay');
    fireEvent.click(confirmBtn);

    // 5. Verify Honest Receipt View
    await waitFor(() => {
      expect(screen.getByText('Đã Tiếp Nhận Đơn Giao Hàng!')).toBeInTheDocument();
    });
    expect(screen.getByText('TG-DELIV-123')).toBeInTheDocument();
    expect(screen.getByText('Chờ nhà hàng xác nhận')).toBeInTheDocument();
    await waitFor(() => expect(onClearCart).toHaveBeenCalledTimes(1));
  });

  it('auto-invalidates active delivery quote when cart items or quantities change', async () => {
    const mockQuoteRes = {
      quote_token: 'signed-deliv-quote-token-xyz',
      subtotal_vnd: 480000,
      shipping_fee_vnd: 0,
      total_vnd: 480000,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      zone: {
        id: '40000000-0000-0000-0000-000000000001',
        name: 'Nội ô Thị trấn Vĩnh An (< 3km)',
        fee_vnd: 15000,
        free_threshold_vnd: 200000,
      },
      items: [
        {
          menu_item_id: 'dish-1',
          item_name: 'Gà Hấp Nước Mắm Nhĩ',
          quantity: 2,
          unit_price_vnd: 240000,
          line_total_vnd: 480000,
        },
      ],
    };

    vi.mocked(deliveryApi.requestDeliveryQuote).mockResolvedValueOnce(mockQuoteRes);

    const { rerender } = renderCartDrawer({
      isOpen: true,
      onClose: vi.fn(),
      cartItems: mockCartItems,
      onUpdateQuantity: vi.fn(),
      onRemoveItem: vi.fn(),
      onClearCart: vi.fn(),
    });

    // Fill form and get quote
    fireEvent.change(screen.getByPlaceholderText('Ví dụ: Nguyễn Văn A'), {
      target: { value: 'Nguyễn Văn A' },
    });
    fireEvent.change(screen.getByPlaceholderText('Ví dụ: 090 280 99 29'), {
      target: { value: '0902809929' },
    });
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: '40000000-0000-0000-0000-000000000001' },
    });
    fireEvent.change(screen.getByPlaceholderText('Số nhà, tên đường, khu phố...'), {
      target: { value: '17 Đường Số 1, Vĩnh An, Đồng Nai' },
    });

    fireEvent.click(screen.getByText('Xem bảng giá & Phí giao hàng'));

    await waitFor(() => {
      expect(screen.getByText('Bảng Giá Giao Hàng Xác Nhận')).toBeInTheDocument();
    });

    // When cart item quantity updates (e.g. 2 -> 3), quote must be invalidated
    const updatedCartItems: CartItem[] = [
      {
        dish: mockDish,
        quantity: 3,
      },
    ];

    rerender(
      <MemoryRouter>
        <AuthContext.Provider value={mockGuestAuthState}>
          <TableSessionProvider>
            <CartProvider>
              <CartDrawer
                isOpen={true}
                onClose={vi.fn()}
                cartItems={updatedCartItems}
                onUpdateQuantity={vi.fn()}
                onRemoveItem={vi.fn()}
                onClearCart={vi.fn()}
              />
            </CartProvider>
          </TableSessionProvider>
        </AuthContext.Provider>
      </MemoryRouter>
    );

    // Quote review view must be invalidated back to form / quote request button
    await waitFor(() => {
      expect(screen.queryByText('Bảng Giá Giao Hàng Xác Nhận')).toBeNull();
    });
    expect(screen.getByText('Xem bảng giá & Phí giao hàng')).toBeInTheDocument();
  });
});
