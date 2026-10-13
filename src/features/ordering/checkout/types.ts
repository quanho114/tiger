import type { CartItem } from '@/features/cart'

export interface CartDrawerProps {
  isOpen: boolean
  onClose: () => void
  cartItems: CartItem[]
  onUpdateQuantity: (dishId: string, delta: number, note?: string) => void
  onRemoveItem: (dishId: string, note?: string) => void
  onClearCart: () => void
}
