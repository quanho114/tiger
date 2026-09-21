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
      prev.map((item) => (item.id === itemId ? { ...item, available: !item.available } : item))
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

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Quản lý Thực đơn & Bếp
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Bật/tắt trạng thái Còn món - Hết món nhanh trong ca và điều chỉnh giá bán
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenCreate}
          className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition shadow-xs self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Thêm món mới</span>
        </button>
      </div>

      {/* Operational Notice if items are Out of Stock */}
      {outOfStockCount > 0 && (
        <div className="p-3 bg-amber-50/80 border border-amber-200/80 rounded-xl flex items-center justify-between text-xs text-amber-900">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              Hiện có <strong>{outOfStockCount} món</strong> đang tạm báo <strong>Hết món</strong> trên hệ thống đặt món online và QR tại bàn.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setAvailabilityFilter('out_of_stock')}
            className="text-[11px] font-semibold text-amber-800 underline hover:text-amber-900 ml-4 whitespace-nowrap"
          >
            Xem danh sách hết món
          </button>
        </div>
      )}

      {/* Controls Bar: Search & Category Pills */}
      <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-4">
        {/* Search and Availability Filter */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm tên món ăn, đồ uống..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          <div className="flex items-center space-x-1.5 self-start sm:self-auto text-xs">
            <span className="text-slate-400 text-[11px] mr-1">Trạng thái:</span>
            <button
              type="button"
              onClick={() => setAvailabilityFilter('all')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                availabilityFilter === 'all'
                  ? 'bg-blue-50 text-blue-700 font-semibold border border-blue-200/60'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              Tất cả ({menuItems.length})
            </button>
            <button
              type="button"
              onClick={() => setAvailabilityFilter('available')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                availabilityFilter === 'available'
                  ? 'bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200/60'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              Còn món ({menuItems.filter((i) => i.available).length})
            </button>
            <button
              type="button"
              onClick={() => setAvailabilityFilter('out_of_stock')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                availabilityFilter === 'out_of_stock'
                  ? 'bg-rose-50 text-rose-700 font-semibold border border-rose-200/60'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              Hết món ({outOfStockCount})
            </button>
          </div>
        </div>

        {/* Categories Horizontal Scroll */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 border-t border-slate-100 pt-3">
          {SAMPLE_CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.id
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition ${
                  isSelected
                    ? 'bg-blue-600 text-white font-semibold shadow-2xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200/70 font-medium'
                }`}
              >
                {cat.name}
              </button>
            )
          })}
        </div>
      </div>

      {/* Menu Items Table */}
      <div className="bg-white border border-slate-200/80 rounded-xl shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-semibold text-slate-400 uppercase bg-slate-50/50">
                <th className="py-3 px-4 font-medium">Tên món & Mô tả</th>
                <th className="py-3 px-4 font-medium">Danh mục</th>
                <th className="py-3 px-4 font-medium">Đơn giá</th>
                <th className="py-3 px-4 font-medium">Kênh phục vụ</th>
                <th className="py-3 px-4 font-medium text-center">Bật/Tắt Còn món</th>
                <th className="py-3 px-4 font-medium text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredItems.map((item) => {
                const isAvailable = item.available

                return (
                  <tr key={item.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3.5 px-4 max-w-xs">
                      <div className="space-y-0.5">
                        <div className="flex items-center space-x-1.5 flex-wrap">
                          <span className="font-bold text-slate-900 text-sm">{item.name}</span>
                          {item.is_signature && (
                            <span className="inline-flex items-center space-x-0.5 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200/60 text-[9px] font-bold">
                              <Star className="w-2.5 h-2.5 text-blue-600" />
                              <span>Đặc sản</span>
                            </span>
                          )}
                          {item.is_bestseller && (
                            <span className="inline-flex items-center space-x-0.5 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200/60 text-[9px] font-bold">
                              <Flame className="w-2.5 h-2.5 text-amber-600" />
                              <span>Bán chạy</span>
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 line-clamp-1">
                          {item.description}
                        </p>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700">
                        {item.category_name || 'Món chính'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="font-mono font-bold text-slate-900 text-xs">
                        {item.price_vnd.toLocaleString('vi-VN')}đ
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center space-x-1.5 text-[11px] text-slate-600">
                        {item.allow_dine_in && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-50 border border-slate-200 text-slate-600">
                            Tại bàn
                          </span>
                        )}
                        {item.allow_delivery && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200/60 text-emerald-700">
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
                        className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold transition border ${
                          isAvailable
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                            : 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                        }`}
                        title="Bấm để chuyển trạng thái Còn/Hết món nhanh"
                      >
                        {isAvailable ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Còn món</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3.5 h-3.5 text-rose-600" />
                            <span>HẾT MÓN</span>
                          </>
                        )}
                      </button>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(item)}
                        className="inline-flex items-center space-x-1 p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
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
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <Utensils className="w-8 h-8 mx-auto mb-2 text-slate-300" />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center space-x-2">
                <Utensils className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-semibold text-slate-900">
                  {editingItem ? 'Chỉnh sửa món ăn' : 'Thêm món mới vào thực đơn'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveItem} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tên món ăn <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Bò xào cần tỏi"
                  value={modalForm.name}
                  onChange={(e) => setModalForm({ ...modalForm, name: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Danh mục <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={modalForm.category_id}
                    onChange={(e) => setModalForm({ ...modalForm, category_id: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    {SAMPLE_CATEGORIES.filter((c) => c.id !== 'cat-all').map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Đơn giá (VNĐ) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    step={1000}
                    value={modalForm.price_vnd}
                    onChange={(e) => setModalForm({ ...modalForm, price_vnd: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mô tả món ăn / Thành phần
                </label>
                <textarea
                  rows={2}
                  placeholder="Ghi chú nguyên liệu, khẩu phần, gia vị..."
                  value={modalForm.description}
                  onChange={(e) => setModalForm({ ...modalForm, description: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              {/* Toggles */}
              <div className="pt-2 border-t border-slate-100 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-700">Trạng thái phục vụ (Còn món)</span>
                  <input
                    type="checkbox"
                    checked={modalForm.available}
                    onChange={(e) => setModalForm({ ...modalForm, available: e.target.checked })}
                    className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-700">Cho phép phục vụ tại quán</span>
                  <input
                    type="checkbox"
                    checked={modalForm.allow_dine_in}
                    onChange={(e) => setModalForm({ ...modalForm, allow_dine_in: e.target.checked })}
                    className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-700">Cho phép giao hàng online</span>
                  <input
                    type="checkbox"
                    checked={modalForm.allow_delivery}
                    onChange={(e) => setModalForm({ ...modalForm, allow_delivery: e.target.checked })}
                    className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-700">Món đặc sản (Signature)</span>
                  <input
                    type="checkbox"
                    checked={modalForm.is_signature}
                    onChange={(e) => setModalForm({ ...modalForm, is_signature: e.target.checked })}
                    className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition shadow-xs"
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
