import { createContext, useContext } from 'react';
import type { MenuItem } from '../data/restaurantData';

export interface CartItem {
  dish: MenuItem;
  quantity: number;
}

export interface CartContextValue {
  cartItems: CartItem[];
  totalCount: number;
  subtotal: number;
  addedId: string | null;
  isCartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  add: (dish: MenuItem) => void;
  updateQty: (dishId: string, delta: number) => void;
  remove: (dishId: string) => void;
  clear: () => void;
}

export const CartContext = createContext<CartContextValue | null>(null);

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
