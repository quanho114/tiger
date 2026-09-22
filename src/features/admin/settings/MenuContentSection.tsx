import { useState, type FC, type ChangeEvent, type FormEvent } from 'react'
import { adminApi } from '../../../lib/api/client'
import { ApiError } from '../../../lib/api/types'
import type { AdminCategory, AdminMenuItem } from '../types'

interface MenuContentSectionProps {
  categories: AdminCategory[]
  menuItems: AdminMenuItem[]
  onReload: () => Promise<void>
  onNotify: (text: string, type: 'success' | 'error') => void
}

export const MenuContentSection: FC<MenuContentSectionProps> = ({
  categories,
  menuItems,
  onReload,
  onNotify,
}) => {
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [availabilityFilter, setAvailabilityFilter] = useState<'ALL' | 'AVAILABLE' | 'UNAVAILABLE'>('ALL')
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null)

  // Category Modals
  const [isCreateCategoryOpen, setIsCreateCategoryOpen] = useState<boolean>(false)
  const [newCatName, setNewCatName] = useState<string>('')
  const [newCatSortOrder, setNewCatSortOrder] = useState<number>(0)
  const [newCatActive, setNewCatActive] = useState<boolean>(true)
  const [isSubmittingCat, setIsSubmittingCat] = useState<boolean>(false)

  const [editingCategory, setEditingCategory] = useState<AdminCategory | null>(null)
  const [editCatName, setEditCatName] = useState<string>('')
  const [editCatSortOrder, setEditCatSortOrder] = useState<number>(0)
  const [editCatActive, setEditCatActive] = useState<boolean>(true)

  // Menu Item Modals
  const [isCreateItemOpen, setIsCreateItemOpen] = useState<boolean>(false)
  const [editingItem, setEditingItem] = useState<AdminMenuItem | null>(null)

  // Form State for Item
  const [itemCategoryId, setItemCategoryId] = useState<string>('')
  const [itemName, setItemName] = useState<string>('')
  const [itemDescription, setItemDescription] = useState<string>('')
  const [itemPriceVnd, setItemPriceVnd] = useState<number>(50000)
  const [itemImagePath, setItemImagePath] = useState<string>('')
  const [itemPublished, setItemPublished] = useState<boolean>(true)
  const [itemAvailable, setItemAvailable] = useState<boolean>(true)
  const [itemAllowDineIn, setItemAllowDineIn] = useState<boolean>(true)
  const [itemAllowDelivery, setItemAllowDelivery] = useState<boolean>(true)
  const [itemServingSize, setItemServingSize] = useState<string>('')
  const [itemPairingNote, setItemPairingNote] = useState<string>('')
  const [itemDeliveryEta, setItemDeliveryEta] = useState<string>('20-30 phút')
  const [itemSpiceLevel, setItemSpiceLevel] = useState<number>(0)
  const [itemIsSignature, setItemIsSignature] = useState<boolean>(false)
  const [itemIsBestseller, setItemIsBestseller] = useState<boolean>(false)
  const [itemIsNew, setItemIsNew] = useState<boolean>(false)
  const [itemTags, setItemTags] = useState<string>('')

  // Upload State
  const [isUploadingImage, setIsUploadingImage] = useState<boolean>(false)
  const [imageUploadError, setImageUploadError] = useState<string | null>(null)
  const [isSubmittingItem, setIsSubmittingItem] = useState<boolean>(false)

  const filteredItems = menuItems.filter((item) => {
    if (selectedCategoryFilter !== 'ALL' && item.category_id !== selectedCategoryFilter) return false
    if (availabilityFilter === 'AVAILABLE' && !item.available) return false
    if (availabilityFilter === 'UNAVAILABLE' && item.available) return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const matchName = item.name.toLowerCase().includes(q)
      const matchDesc = item.description?.toLowerCase().includes(q)
      if (!matchName && !matchDesc) return false
    }
    return true
  })

  // --------------------------------------------------------------------------
  // Category Actions
  // --------------------------------------------------------------------------
  const handleCreateCategory = async (e: FormEvent) => {
    e.preventDefault()
    if (!newCatName.trim()) return
    setIsSubmittingCat(true)
    try {
      await adminApi.post('/categories', {
        name: newCatName.trim(),
        sort_order: Number(newCatSortOrder),
        active: newCatActive,
      })
      setIsCreateCategoryOpen(false)
      setNewCatName('')
      setNewCatSortOrder(0)
      setNewCatActive(true)
      onNotify('Tạo danh mục mới thành công!', 'success')
      await onReload()
    } catch (err: unknown) {
      onNotify(err instanceof Error ? err.message : 'Lỗi tạo danh mục', 'error')
    } finally {
      setIsSubmittingCat(false)
    }
  }

  const handleStartEditCategory = (cat: AdminCategory) => {
    setEditingCategory(cat)
    setEditCatName(cat.name)
    setEditCatSortOrder(cat.sort_order)
    setEditCatActive(cat.active)
  }

  const handleUpdateCategory = async (e: FormEvent) => {
    e.preventDefault()
    if (!editingCategory) return
    setIsSubmittingCat(true)
    try {
      await adminApi.patch(`/categories/${editingCategory.id}`, {
        name: editCatName.trim(),
        sort_order: Number(editCatSortOrder),
        active: editCatActive,
        expected_version: editingCategory.version,
      })
      setEditingCategory(null)
      onNotify('Cập nhật danh mục thành công!', 'success')
      await onReload()
    } catch (err: unknown) {
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') {
        onNotify('Xung đột phiên bản danh mục. Đang tải lại...', 'error')
        await onReload()
      } else {
        onNotify(err instanceof Error ? err.message : 'Lỗi cập nhật danh mục', 'error')
      }
    } finally {
      setIsSubmittingCat(false)
    }
  }

  const handleDeleteCategory = async (cat: AdminCategory) => {
    if (!confirm(`Xác nhận xóa hoặc lưu trữ danh mục "${cat.name}"?`)) return
    try {
      await adminApi.delete(`/categories/${cat.id}`)
      onNotify('Đã xử lý xóa/lưu trữ danh mục.', 'success')
      await onReload()
    } catch (err: unknown) {
      onNotify(err instanceof Error ? err.message : 'Lỗi khi xóa danh mục', 'error')
    }
  }

  // --------------------------------------------------------------------------
  // Image Upload Handler (Strict Invariant V17)
  // --------------------------------------------------------------------------
  const handleImageFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImageUploadError(null)

    // Check size limit: <= 5MB
    if (file.size > 5 * 1024 * 1024) {
      setImageUploadError('Kích thước ảnh vượt quá 5MB. Vui lòng chọn ảnh nhỏ hơn.')
      return
    }

    // Check allowed MIME: JPEG, PNG, WebP
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      setImageUploadError('Chỉ hỗ trợ định dạng JPEG, PNG hoặc WebP. Không chấp nhận SVG.')
      return
    }

    // Client-side magic bytes sniff
    try {
      const buffer = await file.slice(0, 16).arrayBuffer()
      const bytes = new Uint8Array(buffer)
      let valid = false

      // JPEG: 0xFF, 0xD8, 0xFF
      if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) valid = true
      // PNG: 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A
      else if (
        bytes[0] === 0x89 &&
        bytes[1] === 0x40 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a
      ) {
        valid = true
      }
      // WebP: RIFF ... WEBP
      else if (
        bytes[0] === 0x52 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x46 &&
        bytes[8] === 0x57 &&
        bytes[9] === 0x45 &&
        bytes[10] === 0x42 &&
        bytes[11] === 0x50
      ) {
        valid = true
      }

      if (!valid) {
        setImageUploadError('File không đúng cấu trúc ảnh tiêu chuẩn (magic bytes không khớp).')
        return
      }
    } catch {
      // ignore
    }

    setIsUploadingImage(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await adminApi.post<{ url: string; path: string }>('/media/upload', formData)
      setItemImagePath(res.data.url)
      onNotify('Tải ảnh món lên Storage thành công!', 'success')
    } catch (err: unknown) {
      setImageUploadError(err instanceof Error ? err.message : 'Tải ảnh thất bại')
      onNotify('Không thể tải ảnh món', 'error')
    } finally {
      setIsUploadingImage(false)
    }
  }

  // --------------------------------------------------------------------------
  // Menu Item Actions
  // --------------------------------------------------------------------------
  const handleOpenCreateItem = () => {
    setItemCategoryId(categories[0]?.id || '')
    setItemName('')
    setItemDescription('')
    setItemPriceVnd(50000)
    setItemImagePath('')
    setItemPublished(true)
    setItemAvailable(true)
    setItemAllowDineIn(true)
    setItemAllowDelivery(true)
    setItemServingSize('1 đĩa')
    setItemPairingNote('')
    setItemDeliveryEta('20-30 phút')
    setItemSpiceLevel(0)
    setItemIsSignature(false)
    setItemIsBestseller(false)
    setItemIsNew(false)
    setItemTags('')
    setIsCreateItemOpen(true)
  }

  const handleOpenEditItem = (item: AdminMenuItem) => {
    setEditingItem(item)
    setItemCategoryId(item.category_id)
    setItemName(item.name)
    setItemDescription(item.description || '')
    setItemPriceVnd(item.price_vnd)
    setItemImagePath(item.image_path || '')
    setItemPublished(item.published)
    setItemAvailable(item.available)
    setItemAllowDineIn(item.allow_dine_in)
    setItemAllowDelivery(item.allow_delivery)
    setItemServingSize(item.serving_size || '')
    setItemPairingNote(item.pairing_note || '')
    setItemDeliveryEta(item.delivery_eta || '')
    setItemSpiceLevel(item.spice_level || 0)
    setItemIsSignature(Boolean(item.is_signature))
    setItemIsBestseller(Boolean(item.is_bestseller))
    setItemIsNew(Boolean(item.is_new))
    setItemTags(item.tags?.join(', ') || '')
  }

  const handleSaveItem = async (e: FormEvent) => {
    e.preventDefault()
    if (!itemName.trim() || !itemCategoryId) {
      alert('Vui lòng nhập tên món và chọn danh mục')
      return
    }

    const tagsArray = itemTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)

    const payload = {
      category_id: itemCategoryId,
      name: itemName.trim(),
      description: itemDescription.trim(),
      price_vnd: Number(itemPriceVnd),
      image_path: itemImagePath || null,
      published: itemPublished,
      available: itemAvailable,
      allow_dine_in: itemAllowDineIn,
      allow_delivery: itemAllowDelivery,
      serving_size: itemServingSize.trim() || null,
      pairing_note: itemPairingNote.trim() || null,
      delivery_eta: itemDeliveryEta.trim() || null,
      spice_level: Number(itemSpiceLevel),
      is_signature: itemIsSignature,
      is_bestseller: itemIsBestseller,
      is_new: itemIsNew,
      tags: tagsArray,
    }

    setIsSubmittingItem(true)
    try {
      if (editingItem) {
        await adminApi.patch(`/menu-items/${editingItem.id}`, {
          ...payload,
          expected_version: editingItem.version,
        })
        setEditingItem(null)
        onNotify(`Đã cập nhật món "${itemName}".`, 'success')
      } else {
        await adminApi.post('/menu-items', payload)
        setIsCreateItemOpen(false)
        onNotify(`Đã tạo món mới "${itemName}".`, 'success')
      }
      await onReload()
    } catch (err: unknown) {
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') {
        onNotify('Xung đột phiên bản món ăn. Đang tải lại dữ liệu mới nhất...', 'error')
        await onReload()
      } else {
        onNotify(err instanceof Error ? err.message : 'Lỗi khi lưu món ăn', 'error')
      }
    } finally {
      setIsSubmittingItem(false)
    }
  }

  const handleToggleItemAvailability = async (item: AdminMenuItem) => {
    setUpdatingItemId(item.id)
    const nextAvailable = !item.available
    try {
      await adminApi.patch(`/menu-items/${item.id}`, {
        available: nextAvailable,
        expected_version: item.version,
      })
      onNotify(`Món "${item.name}" đã chuyển sang ${nextAvailable ? 'Còn món' : 'Hết món'}.`, 'success')
      await onReload()
    } catch (err: unknown) {
      onNotify(err instanceof Error ? err.message : 'Lỗi cập nhật trạng thái món', 'error')
    } finally {
      setUpdatingItemId(null)
    }
  }

  const handleToggleItemPublished = async (item: AdminMenuItem) => {
    setUpdatingItemId(item.id)
    const nextPublished = !item.published
    try {
      await adminApi.patch(`/menu-items/${item.id}`, {
        published: nextPublished,
        expected_version: item.version,
      })
      onNotify(`Món "${item.name}" đã ${nextPublished ? 'Hiện thực đơn' : 'Ẩn khỏi thực đơn'}.`, 'success')
      await onReload()
    } catch (err: unknown) {
      onNotify(err instanceof Error ? err.message : 'Lỗi cập nhật hiển thị món', 'error')
    } finally {
      setUpdatingItemId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Category Management Block */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <span>📂 Danh Mục Món Ăn</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Phân loại thực đơn và thứ tự hiển thị trên giao diện khách
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsCreateCategoryOpen(true)}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl transition self-start sm:self-auto"
          >
            + Thêm Danh Mục
          </button>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs transition ${
                cat.active
                  ? 'bg-white border-slate-200 text-slate-700'
                  : 'bg-slate-50 border-slate-200 text-stone-500'
              }`}
            >
              <span className="font-semibold">{cat.name}</span>
              <span className="text-[10px] font-mono text-amber-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                #{cat.sort_order}
              </span>
              <button
                type="button"
                onClick={() => handleStartEditCategory(cat)}
                className="text-slate-400 hover:text-slate-600 p-0.5 ml-1"
                title="Chỉnh sửa"
              >
                ✏️
              </button>
              <button
                type="button"
                onClick={() => handleDeleteCategory(cat)}
                className="text-stone-500 hover:text-rose-600 p-0.5"
                title="Xóa/Lưu trữ"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Menu Items Management Block */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <span>🍲 Quản Lý Danh Sách Món Ăn</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Cập nhật giá, hình ảnh, chế độ phục vụ và tình trạng còn/hết món
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenCreateItem}
            className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl shadow-xs transition self-start sm:self-auto flex items-center gap-1.5"
          >
            <span>+ Thêm Món Mới</span>
          </button>
        </div>

        {/* Filter Toolbar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="text"
            placeholder="🔍 Tìm kiếm theo tên hoặc mô tả món..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 placeholder-stone-500 focus:outline-none focus:border-amber-500"
          />

          <select
            value={selectedCategoryFilter}
            onChange={(e) => setSelectedCategoryFilter(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">-- Tất cả danh mục ({categories.length}) --</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setAvailabilityFilter('ALL')}
              className={`flex-1 py-1 rounded-lg font-medium transition ${
                availabilityFilter === 'ALL' ? 'bg-amber-500 text-white font-bold' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Tất cả
            </button>
            <button
              type="button"
              onClick={() => setAvailabilityFilter('AVAILABLE')}
              className={`flex-1 py-1 rounded-lg font-medium transition ${
                availabilityFilter === 'AVAILABLE' ? 'bg-emerald-500 text-white font-bold' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Còn món
            </button>
            <button
              type="button"
              onClick={() => setAvailabilityFilter('UNAVAILABLE')}
              className={`flex-1 py-1 rounded-lg font-medium transition ${
                availabilityFilter === 'UNAVAILABLE' ? 'bg-rose-500 text-white font-bold' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Hết món
            </button>
          </div>
        </div>

        {/* Menu Items Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500 bg-slate-50 border-b border-slate-200 uppercase font-semibold">
              <tr>
                <th className="py-3 px-3">Món ăn</th>
                <th className="py-3 px-3">Danh mục</th>
                <th className="py-3 px-3">Đơn giá</th>
                <th className="py-3 px-3">Phục vụ</th>
                <th className="py-3 px-3">Thuộc tính</th>
                <th className="py-3 px-3 text-center">Hiển thị</th>
                <th className="py-3 px-3 text-center">Trạng thái</th>
                <th className="py-3 px-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-600">
              {filteredItems.map((item) => (
                <tr key={item.id} className="hover:bg-slate-100 transition">
                  <td className="py-3 px-3 font-medium text-slate-900">
                    <div className="flex items-center gap-3">
                      {item.image_path ? (
                        <img
                          src={item.image_path}
                          alt={item.name}
                          className="w-11 h-11 rounded-lg object-cover border border-slate-200 shrink-0"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 text-lg shrink-0">
                          🍲
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900">{item.name}</span>
                          {item.is_signature && (
                            <span className="text-[10px] bg-amber-500/20 text-amber-600 border border-amber-500/40 px-1 rounded">
                              Đặc sản
                            </span>
                          )}
                          {item.is_bestseller && (
                            <span className="text-[10px] bg-red-500/20 text-red-300 border border-red-500/40 px-1 rounded">
                              Bán chạy
                            </span>
                          )}
                        </div>
                        {item.description && (
                          <p className="text-[11px] text-slate-500 line-clamp-1 max-w-xs">{item.description}</p>
                        )}
                        {item.serving_size && (
                          <span className="text-[10px] text-stone-500 font-mono">Khẩu phần: {item.serving_size}</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-slate-500">{item.category_name || 'Chung'}</td>
                  <td className="py-3 px-3 font-mono font-bold text-amber-600 whitespace-nowrap">
                    {item.price_vnd.toLocaleString('vi-VN')}đ
                  </td>
                  <td className="py-3 px-3 whitespace-nowrap space-y-0.5">
                    <div className={item.allow_dine_in ? 'text-emerald-400' : 'text-stone-600'}>
                      {item.allow_dine_in ? '✓ Tại bàn' : '✕ Không tại bàn'}
                    </div>
                    <div className={item.allow_delivery ? 'text-emerald-400' : 'text-stone-600'}>
                      {item.allow_delivery ? '✓ Giao hàng' : '✕ Không giao'}
                    </div>
                  </td>
                  <td className="py-3 px-3 text-[11px] text-slate-500">
                    {item.spice_level ? `🌶️ Cay cấp ${item.spice_level}` : 'Không cay'}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <button
                      type="button"
                      onClick={() => handleToggleItemPublished(item)}
                      disabled={updatingItemId === item.id}
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition ${
                        item.published
                          ? 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                          : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      {item.published ? 'Hiện' : 'Ẩn'}
                    </button>
                  </td>
                  <td className="py-3 px-3 text-center">
                    <button
                      type="button"
                      onClick={() => handleToggleItemAvailability(item)}
                      disabled={updatingItemId === item.id}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
                        item.available
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                      }`}
                    >
                      {item.available ? '● Còn món' : '○ Hết món'}
                    </button>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleOpenEditItem(item)}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition"
                    >
                      Sửa
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Category Create/Edit */}
      {(isCreateCategoryOpen || editingCategory) && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {editingCategory ? `Sửa Danh Mục: ${editingCategory.name}` : 'Thêm Danh Mục Mới'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsCreateCategoryOpen(false)
                  setEditingCategory(null)
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={editingCategory ? handleUpdateCategory : handleCreateCategory} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Tên danh mục <span className="text-amber-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="VD: Món nướng than hoa, Lẩu & Canh"
                  value={editingCategory ? editCatName : newCatName}
                  onChange={(e) =>
                    editingCategory ? setEditCatName(e.target.value) : setNewCatName(e.target.value)
                  }
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Thứ tự sắp xếp (Số nhỏ xếp trước)
                </label>
                <input
                  type="number"
                  value={editingCategory ? editCatSortOrder : newCatSortOrder}
                  onChange={(e) =>
                    editingCategory
                      ? setEditCatSortOrder(Number(e.target.value))
                      : setNewCatSortOrder(Number(e.target.value))
                  }
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="catActiveCheckbox"
                  checked={editingCategory ? editCatActive : newCatActive}
                  onChange={(e) =>
                    editingCategory
                      ? setEditCatActive(e.target.checked)
                      : setNewCatActive(e.target.checked)
                  }
                  className="rounded border-slate-300 bg-white text-amber-500 focus:ring-amber-500"
                />
                <label htmlFor="catActiveCheckbox" className="text-xs text-slate-600">
                  Đang hoạt động (hiển thị trên thực đơn khách)
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateCategoryOpen(false)
                    setEditingCategory(null)
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCat}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5"
                >
                  {isSubmittingCat && (
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                  <span>{editingCategory ? 'Lưu cập nhật' : 'Tạo danh mục'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Menu Item Create / Edit */}
      {(isCreateItemOpen || editingItem) && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-2xl shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {editingItem ? `Chỉnh sửa Món: ${editingItem.name}` : 'Thêm Món Mới Vào Thực Đơn'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsCreateItemOpen(false)
                  setEditingItem(null)
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Danh mục <span className="text-amber-600">*</span>
                  </label>
                  <select
                    required
                    value={itemCategoryId}
                    onChange={(e) => setItemCategoryId(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                  >
                    <option value="">-- Chọn danh mục --</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Tên món <span className="text-amber-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Sườn Nướng Mắc Khén"
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Mô tả chi tiết món ăn
                </label>
                <textarea
                  rows={2}
                  placeholder="Mô tả hương vị, nguyên liệu đặc sắc bản địa..."
                  value={itemDescription}
                  onChange={(e) => setItemDescription(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Đơn giá (VNĐ) <span className="text-amber-600">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    step={1000}
                    value={itemPriceVnd}
                    onChange={(e) => setItemPriceVnd(Number(e.target.value))}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Khẩu phần (Serving size)
                  </label>
                  <input
                    type="text"
                    placeholder="VD: 1 đĩa (2-3 người ăn)"
                    value={itemServingSize}
                    onChange={(e) => setItemServingSize(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Image Upload Area */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <label className="block text-xs font-bold text-slate-700">
                  Ảnh món ăn (JPEG, PNG, WebP ≤ 5MB)
                </label>
                <div className="flex items-center gap-4">
                  {itemImagePath ? (
                    <img
                      src={itemImagePath}
                      alt="Xem trước ảnh món"
                      className="w-16 h-16 rounded-xl object-cover border border-slate-300 shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 text-xl shrink-0">
                      📷
                    </div>
                  )}

                  <div className="space-y-1.5 flex-1">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleImageFileChange}
                      disabled={isUploadingImage}
                      className="text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-amber-600 hover:file:bg-slate-200 cursor-pointer"
                    />
                    {isUploadingImage && (
                      <p className="text-[11px] text-amber-600 animate-pulse">
                        Đang kiểm tra và tải ảnh lên Storage...
                      </p>
                    )}
                    {imageUploadError && (
                      <p className="text-[11px] text-rose-600 font-semibold">{imageUploadError}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Additional Attributes */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Độ cay (0..5)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={5}
                    value={itemSpiceLevel}
                    onChange={(e) => setItemSpiceLevel(Number(e.target.value))}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Thời gian chuẩn bị ship
                  </label>
                  <input
                    type="text"
                    value={itemDeliveryEta}
                    onChange={(e) => setItemDeliveryEta(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Gợi ý dùng kèm
                  </label>
                  <input
                    type="text"
                    placeholder="VD: Rượu mận Tả Van"
                    value={itemPairingNote}
                    onChange={(e) => setItemPairingNote(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Thẻ / Tags (cách nhau bởi dấu phẩy)
                </label>
                <input
                  type="text"
                  placeholder="VD: món nướng, đặc sản, rau rừng"
                  value={itemTags}
                  onChange={(e) => setItemTags(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Checkbox Options */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-200 text-xs">
                <label className="flex items-center gap-2 text-slate-600">
                  <input
                    type="checkbox"
                    checked={itemAllowDineIn}
                    onChange={(e) => setItemAllowDineIn(e.target.checked)}
                    className="rounded border-slate-300 bg-white text-amber-500 focus:ring-amber-500"
                  />
                  <span>Tại bàn</span>
                </label>

                <label className="flex items-center gap-2 text-slate-600">
                  <input
                    type="checkbox"
                    checked={itemAllowDelivery}
                    onChange={(e) => setItemAllowDelivery(e.target.checked)}
                    className="rounded border-slate-300 bg-white text-amber-500 focus:ring-amber-500"
                  />
                  <span>Giao hàng</span>
                </label>

                <label className="flex items-center gap-2 text-slate-600">
                  <input
                    type="checkbox"
                    checked={itemIsSignature}
                    onChange={(e) => setItemIsSignature(e.target.checked)}
                    className="rounded border-slate-300 bg-white text-amber-500 focus:ring-amber-500"
                  />
                  <span>Đặc sản quán</span>
                </label>

                <label className="flex items-center gap-2 text-slate-600">
                  <input
                    type="checkbox"
                    checked={itemIsBestseller}
                    onChange={(e) => setItemIsBestseller(e.target.checked)}
                    className="rounded border-slate-300 bg-white text-amber-500 focus:ring-amber-500"
                  />
                  <span>Món bán chạy</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateItemOpen(false)
                    setEditingItem(null)
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingItem || isUploadingImage}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5"
                >
                  {isSubmittingItem && (
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                  <span>{editingItem ? 'Lưu thay đổi món' : 'Tạo món mới'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
