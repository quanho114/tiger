import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Heart,
  Trash2,
  Plus,
  Loader2,
  AlertCircle,
  UtensilsCrossed,
} from 'lucide-react'
import { fetchCustomerFavorites, removeCustomerFavorite } from './api'
import type { CustomerFavoriteItem } from './types'
import { useCart } from '@/store/cart'

function formatVnd(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(amount)
}

export function AccountFavoritesPage() {
  const [favorites, setFavorites] = useState<CustomerFavoriteItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const { add, setCartOpen } = useCart()

  async function load() {
    try {
      setIsLoading(true)
      setError(null)
      const data = await fetchCustomerFavorites()
      setFavorites(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải danh sách món yêu thích')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleRemove = async (menuItemId: string) => {
    try {
      setRemovingId(menuItemId)
      await removeCustomerFavorite(menuItemId)
      setFavorites((prev) => prev.filter((f) => f.menu_item_id !== menuItemId))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Không thể xóa món khỏi danh sách yêu thích')
    } finally {
      setRemovingId(null)
    }
  }

  const handleAddToCart = (item: CustomerFavoriteItem) => {
    add({
      id: item.menu_item_id,
      name: item.name,
      price: item.price_vnd,
      category: item.category_name,
      category_id: item.category_id,
      description: '',
      image: item.image_path || '/images/bo-nuong.jpg',
      available: item.available,
      modes: ['dine-in', 'delivery'],
    })
    setCartOpen(true)
  }

  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 border border-amber-100 shadow-xs space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
            <Heart className="w-5 h-5 text-red-500 fill-red-500" />
            <span>Món ăn yêu thích</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Danh sách những món nhậu khoái khẩu bạn đã lưu lại để gọi nhanh bất cứ lúc nào
          </p>
        </div>

        <Link
          to="/menu"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 text-xs font-bold transition-colors self-start sm:self-auto"
        >
          <UtensilsCrossed className="w-4 h-4" />
          <span>Xem thực đơn</span>
        </Link>
      </div>

      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-amber-500 mb-3" />
          <p className="text-sm font-medium">Đang tải món yêu thích...</p>
        </div>
      ) : error ? (
        <div className="py-10 text-center text-red-600">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-80" />
          <p className="text-sm font-semibold">{error}</p>
        </div>
      ) : favorites.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Heart className="w-12 h-12 mx-auto mb-3 opacity-30 text-red-400" />
          <p className="text-base font-bold text-slate-700">Chưa có món ăn yêu thích nào</p>
          <p className="text-xs text-slate-400 mt-1">
            Bấm vào biểu tượng trái tim trên thực đơn để lưu lại các món nhậu khoái khẩu
          </p>
          <Link
            to="/menu"
            className="inline-block mt-4 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
          >
            Khám phá thực đơn ngay
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {favorites.map((item) => (
            <div
              key={item.menu_item_id}
              className="rounded-2xl border border-slate-200/80 hover:border-amber-300 overflow-hidden bg-white shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between"
            >
              <div className="relative h-36 bg-slate-100 overflow-hidden">
                <img
                  src={item.image_path || '/images/bo-nuong.jpg'}
                  alt={item.name}
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  disabled={removingId === item.menu_item_id}
                  onClick={() => handleRemove(item.menu_item_id)}
                  className="absolute top-2.5 right-2.5 p-2 rounded-full bg-white/90 text-red-500 hover:bg-white shadow-xs transition-transform active:scale-95 disabled:opacity-50"
                  title="Bỏ thích"
                >
                  {removingId === item.menu_item_id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>

                <div className="absolute bottom-2 left-2">
                  <span className="text-[11px] font-bold text-white bg-slate-900/70 backdrop-blur-xs px-2.5 py-0.5 rounded-full">
                    {item.category_name}
                  </span>
                </div>
              </div>

              <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-sm text-slate-900 line-clamp-1">{item.name}</h3>
                  <p className="text-base font-black text-amber-600 mt-1">
                    {formatVnd(item.price_vnd)}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={!item.available}
                  onClick={() => handleAddToCart(item)}
                  className={`w-full py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                    item.available
                      ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{item.available ? 'Thêm vào giỏ' : 'Tạm hết món'}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
