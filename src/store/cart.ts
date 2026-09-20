import { createContext, useContext } from 'react';
import type { MenuItem } from '../data/restaurantData';
import type { CartOrderContext } from '@/features/cart/types';

export interface CartItem {
  dish: MenuItem;
  quantity: number;
  note?: string;
}

export interface CartContextValue {
  cartItems: CartItem[];
  totalCount: number;
  subtotal: number;
  addedId: string | null;
  isCartOpen: boolean;
  context: CartOrderContext;
  orderNote?: string;
  setCartOpen: (open: boolean) => void;
  setContext: (context: CartOrderContext) => void;
  setOrderNote: (note: string) => void;
  add: (dish: MenuItem, note?: string, quantity?: number) => void;
  updateQty: (dishId: string, delta: number) => void;
  updateItemNote: (dishId: string, note?: string) => void;
  remove: (dishId: string) => void;
  clear: () => void;
}

export const CartContext = createContext<CartContextValue | null>(null);

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}

