import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { MenuItem } from '../data/restaurantData';
import { CartContext, type CartContextValue, type CartItem } from './cart';

export function CartProvider({ children }: { children: ReactNode }) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [addedId, setAddedId] = useState<string | null>(null);

  const add = useCallback((dish: MenuItem) => {
    setCartItems((prev) => {
      const existing = prev.find((item) => item.dish.id === dish.id);
      if (existing) {
        return prev.map((item) =>
          item.dish.id === dish.id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [...prev, { dish, quantity: 1 }];
    });
    setAddedId(dish.id);
    window.setTimeout(() => {
      setAddedId((current) => (current === dish.id ? null : current));
    }, 1800);
  }, []);

  const updateQty = useCallback((dishId: string, delta: number) => {
    setCartItems((prev) =>
      prev
        .map((item) => {
          if (item.dish.id === dishId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[],
    );
  }, []);

  const remove = useCallback((dishId: string) => {
    setCartItems((prev) => prev.filter((item) => item.dish.id !== dishId));
  }, []);

  const clear = useCallback(() => {
    setCartItems([]);
  }, []);

  const value = useMemo<CartContextValue>(() => {
    const totalCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);
    const subtotal = cartItems.reduce((acc, item) => acc + item.dish.price * item.quantity, 0);
    return {
      cartItems,
      totalCount,
      subtotal,
      addedId,
      isCartOpen,
      setCartOpen: setIsCartOpen,
      add,
      updateQty,
      remove,
      clear,
    };
  }, [cartItems, addedId, isCartOpen, add, updateQty, remove, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
