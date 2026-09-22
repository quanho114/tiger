import { useState, useMemo, type FC } from 'react'
import {
  Search,
  Plus,
  CheckCircle2,
  XCircle,
  Edit2,
  Utensils,
  AlertCircle,
  X,
  Star,
  Flame,
  MoreHorizontal,
} from 'lucide-react'
import type { AdminMenuItem, AdminCategory } from '../types'

const SAMPLE_CATEGORIES: AdminCategory[] = [
  { id: 'cat-all', name: 'Tất cả món', slug: 'all', sort_order: 0, active: true, version: 1 },
  { id: 'cat-1', name: 'Món nhậu & Đặc sản', slug: 'dac-san', sort_order: 1, active: true, version: 1 },
  { id: 'cat-2', name: 'Món Bò & Heo', slug: 'bo-heo', sort_order: 2, active: true, version: 1 },
  { id: 'cat-3', name: 'Món Gà & Vịt', slug: 'ga-vit', sort_order: 3, active: true, version: 1 },
  { id: 'cat-4', name: 'Hải sản tươi sống', slug: 'hai-san', sort_order: 4, active: true, version: 1 },
  { id: 'cat-5', name: 'Lẩu gia đình', slug: 'lau', sort_order: 5, active: true, version: 1 },
  { id: 'cat-6', name: 'Bia & Nước giải khát', slug: 'do-uong', sort_order: 6, active: true, version: 1 },
]

const SAMPLE_MENU_ITEMS: AdminMenuItem[] = [
  {
    id: 'item-1',
    category_id: 'cat-2',
    category_name: 'Món Bò & Heo',
    name: 'Bò lúc lắc khoai tây',
    slug: 'bo-luc-lac-khoai-tay',
    description: 'Thịt thăn bò tươi xào cùng ớt chuông, hành tây và sốt tiêu đen gia truyền',
    price_vnd: 110000,
    published: true,
    available: true,
    allow_dine_in: true,
    allow_delivery: true,
    is_signature: true,
    is_bestseller: true,
    version: 1,
  },
  {
    id: 'item-2',
    category_id: 'cat-3',
    category_name: 'Món Gà & Vịt',
    name: 'Gà nướng muối ớt (Nửa con)',
    slug: 'ga-nuong-muoi-ot-nua-con',
    description: 'Gà ta da giòn tẩm ướp muối ớt cay nồng nướng than hoa thơm lừng',
    price_vnd: 120000,
    published: true,
    available: true,
    allow_dine_in: true,
    allow_delivery: true,
    is_bestseller: true,
    version: 1,
  },
  {
    id: 'item-3',
    category_id: 'cat-5',
    category_name: 'Lẩu gia đình',
    name: 'Lẩu Thái hải sản chua cay',
    slug: 'lau-thai-hai-san-chua-cay',
    description: 'Nước dùng chua cay đậm đà, tôm sú, mực tươi, nghêu, nấm và rau ăn kèm',
    price_vnd: 260000,
    published: true,
    available: true,
    allow_dine_in: true,
    allow_delivery: false,
    is_signature: true,
    version: 1,
  },
  {
    id: 'item-4',
    category_id: 'cat-4',
    category_name: 'Hải sản tươi sống',
    name: 'Mực chiên giòn sốt me',
    slug: 'muc-chien-gion-sot-me',
    description: 'Mực ống tươi cắt khoanh chiên vàng giòn quyện sốt me chua ngọt cay dịu',
    price_vnd: 95000,
    published: true,
    available: true,
    allow_dine_in: true,
    allow_delivery: true,
    version: 1,
  },
  {
    id: 'item-5',
    category_id: 'cat-1',
    category_name: 'Món nhậu & Đặc sản',
    name: 'Dồi sụn nướng than hoa',
    slug: 'doi-sun-nuong-than-hoa',
    description: 'Dồi sụn non giòn sần sật, thơm mùi húng quế và tiêu sọ',
    price_vnd: 85000,
    published: true,
    available: false, // Out of stock operational test
    allow_dine_in: true,
    allow_delivery: true,
    version: 1,
  },
  {
    id: 'item-6',
    category_id: 'cat-6',
    category_name: 'Bia & Nước giải khát',
    name: 'Bia Tiger Bạc Crystal (Lon 330ml)',
    slug: 'bia-tiger-bac-crystal-lon',
    description: 'Bia ướp lạnh sảng khoái',
    price_vnd: 20000,
    published: true,
    available: true,
    allow_dine_in: true,
    allow_delivery: true,
    is_bestseller: true,
    version: 1,
  },
]

export const AdminMenuPage: FC = () => {
  const [menuItems, setMenuItems] = useState<AdminMenuItem[]>(SAMPLE_MENU_ITEMS)
  const [selectedCategory, setSelectedCategory] = useState<string>('cat-all')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'available' | 'out_of_stock'>('all')

  // Toast notification
  const [notification, setNotification] = useState<string | null>(null)
  const showToast = (msg: string) => {
    setNotification(msg)
    setTimeout(() => {
      setNotification((prev) => (prev === msg ? null : prev))
    }, 3200)
  }

  // Edit / Add Modal state
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false)
  const [editingItem, setEditingItem] = useState<AdminMenuItem | null>(null)
  const [modalForm, setModalForm] = useState({
    name: '',
    category_id: 'cat-2',
    description: '',
    price_vnd: 100000,
    available: true,
    allow_dine_in: true,
    allow_delivery: true,
    is_signature: false,
    is_bestseller: false,
  })

  // Fast toggle availability (Còn món / Hết món)
  const handleToggleAvailable = (itemId: string) => {
    setMenuItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          const nextState = !item.available
          showToast(`Đã chuyển "${item.name}" sang trạng thái: ${nextState ? 'Còn món' : 'Hết món'}`)
          return { ...item, available: nextState }
        }
        return item
      })
    )
  }

  // Open edit modal
  const handleOpenEdit = (item: AdminMenuItem) => {
    setEditingItem(item)
    setModalForm({
      name: item.name,
      category_id: item.category_id,
      description: item.description,
      price_vnd: item.price_vnd,
      available: item.available,
      allow_dine_in: item.allow_dine_in,
      allow_delivery: item.allow_delivery,
      is_signature: item.is_signature || false,
      is_bestseller: item.is_bestseller || false,
    })
    setIsModalOpen(true)
  }

  // Open create modal
  const handleOpenCreate = () => {
    setEditingItem(null)
    setModalForm({
      name: '',
      category_id: 'cat-2',
      description: '',
      price_vnd: 80000,
      available: true,
      allow_dine_in: true,
      allow_delivery: true,
      is_signature: false,
      is_bestseller: false,
    })
    setIsModalOpen(true)
  }

  const handleSaveItem = (e: React.FormEvent) => {
    e.preventDefault()
    if (!modalForm.name.trim()) return

    const categoryObj = SAMPLE_CATEGORIES.find((c) => c.id === modalForm.category_id)

    if (editingItem) {
      setMenuItems((prev) =>
        prev.map((item) =>
          item.id === editingItem.id
            ? {
                ...item,
                ...modalForm,
                category_name: categoryObj?.name || item.category_name,
              }
            : item
        )
      )
      showToast(`Đã cập nhật món "${modalForm.name}"`)
    } else {
      const newItem: AdminMenuItem = {
        id: `item-${Date.now()}`,
        ...modalForm,
        slug: modalForm.name.toLowerCase().replace(/\s+/g, '-'),
        category_name: categoryObj?.name || 'Món chính',
        published: true,
        version: 1,
      }
      setMenuItems((prev) => [newItem, ...prev])
      showToast(`Đã thêm món mới "${modalForm.name}" vào thực đơn`)
    }

    setIsModalOpen(false)
  }

  // Filtered menu items
  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
      // Category filter
      if (selectedCategory !== 'cat-all' && item.category_id !== selectedCategory) {
        return false
      }
      // Availability filter
      if (availabilityFilter === 'available' && !item.available) return false
      if (availabilityFilter === 'out_of_stock' && item.available) return false
      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        return (
          item.name.toLowerCase().includes(query) ||
          item.description.toLowerCase().includes(query)
        )
      }
      return true
    })
  }, [menuItems, selectedCategory, availabilityFilter, searchQuery])

  const outOfStockCount = menuItems.filter((i) => !i.available).length
  const availableCount = menuItems.filter((i) => i.available).length

  // Elera tactile multi-layer shadow
  const eleraCardShadow = '0 1px 1px rgba(0,0,0,.06), 0 3px 3px rgba(0,0,0,.06), 0 6px 6px rgba(0,0,0,.06), 0 12px 12px rgba(0,0,0,.04), 0 24px 24px rgba(0,0,0,.04)'

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 font-sans tracking-[-0.01em]">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#2b2e2c] text-white text-xs px-4 py-3 rounded-2xl shadow-2xl flex items-center space-x-2.5 border border-stone-700 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <CheckCircle2 className="w-4 h-4 text-[#7cd56e] shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {/* Header bar phong cách Elera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-[20px] font-medium tracking-[-0.25px] text-[#171a17]">
              Quản lý Thực đơn & Bếp
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded-[6px] text-[11px] font-medium bg-[#e4f7c6] text-[#3e6300]">
              {menuItems.length} món hoạt động
            </span>
          </div>
          <p className="text-[12px] text-[#787979] mt-0.5">
            Bật/tắt trạng thái Còn món - Hết món nhanh trong ca và điều chỉnh giá bán
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenCreate}
          className="inline-flex items-center space-x-1.5 px-4 py-2 bg-[#2b2e2c] hover:bg-black text-white rounded-[12px] text-xs font-medium transition active:scale-95 shadow-xs self-start sm:self-auto"
        >
          <Plus className="w-4 h-4 text-[#7cd56e]" />
          <span>Thêm món mới</span>
        </button>
      </div>

      {/* 4 KPI Overview Strip giống Elera */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          style={{ boxShadow: eleraCardShadow }}
          className="bg-white rounded-[20px] p-4 border border-[#e2e3e3]/50"
        >
          <span className="text-[12px] font-medium text-[#787979]">Tổng số món</span>
          <p className="text-[22px] font-semibold font-mono tracking-tight text-[#171a17] mt-1.5">
            {menuItems.length}
            <span className="text-[13px] font-normal text-[#787979] ml-1">món</span>
          </p>
          <p className="text-[11px] text-[#787979] mt-1">Đầy đủ 6 danh mục chính</p>
        </div>

        <div
          style={{ boxShadow: eleraCardShadow }}
          className="bg-white rounded-[20px] p-4 border border-[#e2e3e3]/50"
        >
          <span className="text-[12px] font-medium text-[#787979]">Đang phục vụ</span>
          <p className="text-[22px] font-semibold font-mono tracking-tight text-[#2e5b15] mt-1.5">
            {availableCount}
            <span className="text-[13px] font-normal text-[#787979] ml-1">món</span>
          </p>
          <p className="text-[11px] text-[#2e5b15] mt-1">Sẵn sàng gọi tại bàn & giao đi</p>
        </div>

        <div
          style={{ boxShadow: eleraCardShadow }}
          className="bg-white rounded-[20px] p-4 border border-[#e2e3e3]/50"
        >
          <span className="text-[12px] font-medium text-[#787979]">Tạm hết món</span>
          <p className="text-[22px] font-semibold font-mono tracking-tight text-[#c93424] mt-1.5">
            {outOfStockCount}
            <span className="text-[13px] font-normal text-[#787979] ml-1">món</span>
          </p>
          <p className="text-[11px] text-[#c93424] mt-1">Đã ẩn trên máy gọi món QR</p>
        </div>

        <div
          style={{ boxShadow: eleraCardShadow }}
          className="bg-white rounded-[20px] p-4 border border-[#e2e3e3]/50"
        >
          <span className="text-[12px] font-medium text-[#787979]">Danh mục</span>
          <p className="text-[22px] font-semibold font-mono tracking-tight text-[#171a17] mt-1.5">
            {SAMPLE_CATEGORIES.length - 1}
            <span className="text-[13px] font-normal text-[#787979] ml-1">nhóm</span>
          </p>
          <p className="text-[11px] text-[#787979] mt-1">Phân luồng ra món theo trạm bếp</p>
        </div>
      </div>

      {/* Operational Notice if items are Out of Stock */}
      {outOfStockCount > 0 && (
        <div className="p-3.5 bg-[#fef9ee] border border-[#f5e6c4] rounded-[16px] flex items-center justify-between text-xs text-[#8c5e00] shadow-2xs">
          <div className="flex items-center space-x-2.5">
            <AlertCircle className="w-4 h-4 text-[#d97706] shrink-0" />
            <span>
              Hiện có <strong>{outOfStockCount} món</strong> đang tạm báo <strong>Hết món</strong> trên hệ thống đặt món online và QR tại bàn.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setAvailabilityFilter('out_of_stock')}
            className="text-[11px] font-medium text-[#b45309] hover:underline ml-4 whitespace-nowrap"
          >
            Xem danh sách hết món
          </button>
        </div>
      )}

      {/* Controls Bar: Search & Category Pills */}
      <div
        style={{ boxShadow: eleraCardShadow }}
        className="bg-white rounded-[20px] p-4.5 border border-[#e2e3e3]/50 space-y-4"
      >
        {/* Search and Availability Filter */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-[#8a8f89] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm tên món ăn, đồ uống..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-3.5 py-2 text-xs bg-[#f6f5f3] hover:bg-[#f1f1ee] focus:bg-white border border-[#e2e3e3] rounded-[12px] text-[#171a17] focus:outline-none focus:ring-2 focus:ring-[#7cd56e]/40 transition"
            />
          </div>

          <div className="flex items-center space-x-2 self-start sm:self-auto text-xs">
            <span className="text-[#8a8f89] text-[11px] mr-0.5">Trạng thái:</span>
            <button
              type="button"
              aria-label="Lọc tất cả món"
              onClick={() => setAvailabilityFilter('all')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition flex items-center space-x-1.5 ${
                availabilityFilter === 'all'
                  ? 'bg-[#2b2e2c] text-white shadow-xs'
                  : 'bg-white hover:bg-[#faf9f7] text-[#5c5e63] border border-[#e2e3e3]'
              }`}
            >
              <span>Tất cả</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-semibold ${
                  availabilityFilter === 'all' ? 'bg-white/20 text-white' : 'bg-[#e4f7c6] text-[#2e5b15]'
                }`}
              >
                {menuItems.length}
              </span>
            </button>
            <button
              type="button"
              aria-label="Lọc còn món"
              onClick={() => setAvailabilityFilter('available')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition flex items-center space-x-1.5 ${
                availabilityFilter === 'available'
                  ? 'bg-[#2b2e2c] text-white shadow-xs'
                  : 'bg-white hover:bg-[#faf9f7] text-[#5c5e63] border border-[#e2e3e3]'
              }`}
            >
              <span>Còn món</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-semibold ${
                  availabilityFilter === 'available' ? 'bg-white/20 text-white' : 'bg-[#e4f7c6] text-[#2e5b15]'
                }`}
              >
                {availableCount}
              </span>
            </button>
            <button
              type="button"
              aria-label="Lọc hết món"
              onClick={() => setAvailabilityFilter('out_of_stock')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition flex items-center space-x-1.5 ${
                availabilityFilter === 'out_of_stock'
                  ? 'bg-[#2b2e2c] text-white shadow-xs'
                  : 'bg-white hover:bg-[#faf9f7] text-[#5c5e63] border border-[#e2e3e3]'
              }`}
            >
              <span>Hết món</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-semibold ${
                  availabilityFilter === 'out_of_stock' ? 'bg-white/20 text-white' : 'bg-[#fceae6] text-[#c93424]'
                }`}
              >
                {outOfStockCount}
              </span>
            </button>
          </div>
        </div>

        {/* Categories Horizontal Scroll */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 border-t border-[#f0f0ee] pt-3.5">
          {SAMPLE_CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.id
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs whitespace-nowrap transition font-medium ${
                  isSelected
                    ? 'bg-[#2b2e2c] text-white shadow-xs font-semibold'
                    : 'bg-white hover:bg-[#faf9f7] text-[#5c5e63] border border-[#e2e3e3]'
                }`}
              >
                {cat.name}
              </button>
            )
          })}
        </div>
      </div>

      {/* Menu Items Table Card */}
      <div
        style={{ boxShadow: eleraCardShadow }}
        className="bg-white rounded-[20px] border border-[#e2e3e3]/50 overflow-hidden"
      >
        {/* Table Header Row */}
        <div className="px-5 py-4 border-b border-[#f0f0ee] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-[10px] bg-[#424242] text-white flex items-center justify-center shadow-xs">
              <Utensils className="w-4 h-4 text-[#7cd56e]" />
            </div>
            <div>
              <h2 className="text-[15.5px] font-medium tracking-[-0.25px] text-[#171a17]">
                Danh Sách Món Thực Đơn
              </h2>
              <p className="text-[11px] text-[#8a8f89]">
                Cập nhật bảng giá và trạng thái phục vụ thời gian thực
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => showToast('Mở tùy chọn bảng thực đơn')}
            className="w-7 h-7 rounded-lg hover:bg-stone-100 flex items-center justify-center text-[#8e9094] transition"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#f0f0ee] text-[12px] font-normal text-[#8a8f89] bg-[#faf9f7]">
                <th className="py-3 px-5 font-normal">Tên món & Mô tả</th>
                <th className="py-3 px-4 font-normal">Danh mục</th>
                <th className="py-3 px-4 font-normal">Đơn giá</th>
                <th className="py-3 px-4 font-normal">Kênh phục vụ</th>
                <th className="py-3 px-4 font-normal text-center">Bật/Tắt Còn món</th>
                <th className="py-3 px-5 font-normal text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f7f6f4] text-[#171a17]">
              {filteredItems.map((item) => {
                const isAvailable = item.available

                return (
                  <tr key={item.id} className="hover:bg-[#faf9f7] transition group">
                    <td className="py-3.5 px-5 max-w-sm">
                      <div className="space-y-0.5">
                        <div className="flex items-center space-x-2 flex-wrap">
                          <span className="font-medium text-[#171a17] text-[13.5px]">{item.name}</span>
                          {item.is_signature && (
                            <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-[5px] bg-[#edf3fd] text-[#3d78e3] text-[10px] font-medium">
                              <Star className="w-2.5 h-2.5 text-[#3d78e3]" />
                              <span>Đặc sản</span>
                            </span>
                          )}
                          {item.is_bestseller && (
                            <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-[5px] bg-[#fef3c7] text-[#92400e] text-[10px] font-medium">
                              <Flame className="w-2.5 h-2.5 text-amber-500" />
                              <span>Bán chạy</span>
                            </span>
                          )}
                        </div>
                        <p className="text-[11.5px] text-[#787979] line-clamp-1">
                          {item.description}
                        </p>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-[6px] text-[11px] font-medium bg-[#f1f1ee] text-[#555]">
                        {item.category_name || 'Món chính'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="font-mono font-semibold text-[#171a17] text-[13.5px]">
                        {item.price_vnd.toLocaleString('vi-VN')}đ
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center space-x-1.5 text-[11px]">
                        {item.allow_dine_in && (
                          <span className="px-2 py-0.5 rounded-[5px] bg-stone-100 text-stone-700 font-medium">
                            Tại bàn
                          </span>
                        )}
                        {item.allow_delivery && (
                          <span className="px-2 py-0.5 rounded-[5px] bg-[#e4f7c6] text-[#2e5b15] font-medium">
                            Giao hàng
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Operational Fast Toggle Button */}
                    <td className="py-3.5 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleAvailable(item.id)}
                        className={`inline-flex items-center space-x-1.5 px-3.5 py-1 rounded-full text-[11px] font-medium transition border active:scale-95 ${
                          isAvailable
                            ? 'bg-[#eaf7e8] border-[#cbe9c8] text-[#2fa32a] hover:bg-[#dcf2d9]'
                            : 'bg-[#fceae6] border-[#f5c6be] text-[#c93424] hover:bg-[#fadad3]'
                        }`}
                        title="Bấm để chuyển trạng thái Còn/Hết món nhanh"
                      >
                        {isAvailable ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#2fa32a]" />
                            <span>Còn món</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3.5 h-3.5 text-[#c93424]" />
                            <span>HẾT MÓN</span>
                          </>
                        )}
                      </button>
                    </td>

                    <td className="py-3.5 px-5 text-right">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(item)}
                        className="inline-flex items-center space-x-1 p-1.5 text-[#8a8f89] hover:text-[#171a17] hover:bg-stone-100 rounded-[8px] transition"
                        title="Chỉnh sửa món ăn"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span className="text-[11px] font-medium">Sửa</span>
                      </button>
                    </td>
                  </tr>
                )
              })}

              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[#8a8f89]">
                    <Utensils className="w-8 h-8 mx-auto mb-2 text-stone-300" />
                    <p className="text-xs font-medium">Không tìm thấy món ăn nào phù hợp</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Edit or Create Menu Item */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            style={{ boxShadow: '0 20px 40px -15px rgba(0,0,0,0.15)' }}
            className="relative w-full max-w-lg bg-white rounded-[24px] border border-[#e2e3e3] overflow-hidden"
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[#f0f0ee] flex items-center justify-between bg-[#faf9f7]">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-[8px] bg-[#424242] text-white flex items-center justify-center shadow-2xs">
                  <Utensils className="w-4 h-4 text-[#7cd56e]" />
                </div>
                <h3 className="text-[15px] font-medium text-[#171a17]">
                  {editingItem ? 'Chỉnh sửa món ăn' : 'Thêm món mới vào thực đơn'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full text-[#8a8f89] hover:text-[#171a17] hover:bg-stone-100 flex items-center justify-center transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveItem} className="p-6 space-y-4">
              <div>
                <label className="block text-[12px] font-medium text-[#171a17] mb-1.5">
                  Tên món ăn <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Bò xào cần tỏi"
                  value={modalForm.name}
                  onChange={(e) => setModalForm({ ...modalForm, name: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs bg-[#f6f5f3] hover:bg-[#f1f1ee] focus:bg-white border border-[#e2e3e3] rounded-[12px] text-[#171a17] focus:outline-none focus:ring-2 focus:ring-[#7cd56e]/40 transition"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-medium text-[#171a17] mb-1.5">
                    Danh mục <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={modalForm.category_id}
                    onChange={(e) => setModalForm({ ...modalForm, category_id: e.target.value })}
                    className="w-full px-3.5 py-2 text-xs bg-[#f6f5f3] border border-[#e2e3e3] rounded-[12px] text-[#171a17] focus:outline-none focus:ring-2 focus:ring-[#7cd56e]/40 transition"
                  >
                    {SAMPLE_CATEGORIES.filter((c) => c.id !== 'cat-all').map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-[#171a17] mb-1.5">
                    Đơn giá (VNĐ) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    step={1000}
                    value={modalForm.price_vnd}
                    onChange={(e) => setModalForm({ ...modalForm, price_vnd: Number(e.target.value) })}
                    className="w-full px-3.5 py-2 text-xs bg-[#f6f5f3] border border-[#e2e3e3] rounded-[12px] text-[#171a17] font-mono focus:outline-none focus:ring-2 focus:ring-[#7cd56e]/40 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-medium text-[#171a17] mb-1.5">
                  Mô tả món ăn / Thành phần
                </label>
                <textarea
                  rows={2}
                  placeholder="Ghi chú nguyên liệu, khẩu phần, gia vị..."
                  value={modalForm.description}
                  onChange={(e) => setModalForm({ ...modalForm, description: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs bg-[#f6f5f3] hover:bg-[#f1f1ee] focus:bg-white border border-[#e2e3e3] rounded-[12px] text-[#171a17] focus:outline-none focus:ring-2 focus:ring-[#7cd56e]/40 transition"
                />
              </div>

              {/* Toggles */}
              <div className="pt-2.5 border-t border-[#f0f0ee] space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-[#171a17]">Trạng thái phục vụ (Còn món)</span>
                  <input
                    type="checkbox"
                    checked={modalForm.available}
                    onChange={(e) => setModalForm({ ...modalForm, available: e.target.checked })}
                    className="rounded text-[#424242] focus:ring-[#7cd56e] w-4 h-4 accent-[#424242]"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-[#171a17]">Cho phép phục vụ tại quán</span>
                  <input
                    type="checkbox"
                    checked={modalForm.allow_dine_in}
                    onChange={(e) => setModalForm({ ...modalForm, allow_dine_in: e.target.checked })}
                    className="rounded text-[#424242] focus:ring-[#7cd56e] w-4 h-4 accent-[#424242]"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-[#171a17]">Cho phép giao hàng online</span>
                  <input
                    type="checkbox"
                    checked={modalForm.allow_delivery}
                    onChange={(e) => setModalForm({ ...modalForm, allow_delivery: e.target.checked })}
                    className="rounded text-[#424242] focus:ring-[#7cd56e] w-4 h-4 accent-[#424242]"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-[#171a17]">Món đặc sản (Signature)</span>
                  <input
                    type="checkbox"
                    checked={modalForm.is_signature}
                    onChange={(e) => setModalForm({ ...modalForm, is_signature: e.target.checked })}
                    className="rounded text-[#424242] focus:ring-[#7cd56e] w-4 h-4 accent-[#424242]"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="pt-4 border-t border-[#f0f0ee] flex items-center justify-end space-x-2.5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-[#5c5e63] hover:text-[#171a17] hover:bg-stone-100 rounded-[10px] transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#2b2e2c] hover:bg-black text-white rounded-[10px] text-xs font-medium transition shadow-xs active:scale-95"
                >
                  Lưu món ăn
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
