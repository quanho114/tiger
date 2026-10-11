// Tiger Admin — dish profile editor (web-only).
import { useState } from 'react'
import type { AdminMenuItem } from '../../types'
import {
  ALLERGEN_STATUSES,
  ALLERGEN_TYPES,
  MEAL_ROLES,
  TASTE_TAGS,
  type AllergenStatus,
  type AllergenType,
  type MealRole,
  type ProfileDetail,
} from '../types'
import { saveAllergens, saveServing, saveTaste, verifyAllergens } from '../api'

interface Props {
  dishes: AdminMenuItem[]
  detail: ProfileDetail
  onSaved: () => Promise<void>
  notify: (text: string, type: 'success' | 'error') => void
}

const inputClass =
  'w-full rounded-lg border border-[#e2e3e3] bg-white px-3 py-2 text-sm text-[#171a17] outline-none focus:border-[#2b2e2c]'
const labelClass = 'block text-xs font-semibold text-[#5c5e5c] mb-1'
const sectionClass = 'rounded-xl border border-[#e2e3e3] bg-white p-4'
const sectionTitleClass = 'text-sm font-bold text-[#171a17] mb-3'
const buttonPrimary =
  'rounded-lg bg-[#2b2e2c] px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50'

export function ProfileEditor({ dishes, detail, onSaved, notify }: Props) {
  const { item } = detail
  const [serving, setServing] = useState({
    meal_role: item.serving.mealRole ?? ('' as '' | MealRole),
    people_min: item.serving.peopleMin?.toString() ?? '',
    people_max: item.serving.peopleMax?.toString() ?? '',
    serving_unit: item.serving.unit ?? '',
    serving_description: item.serving.description ?? '',
  })
  const [taste, setTaste] = useState({
    spice_level: item.taste.spiceLevel?.toString() ?? '',
    richness_level: item.taste.richnessLevel?.toString() ?? '',
    tags: [...item.taste.tags],
    pairingId: '',
  })
  const [dietaryText, setDietaryText] = useState('')
  const [pairingIds, setPairingIds] = useState<string[]>([...detail.item.pairingItemIds])
  const [allergens, setAllergens] = useState<Partial<Record<AllergenType, AllergenStatus>>>({
    ...item.allergens.states,
  })
  const [kitchenNotes, setKitchenNotes] = useState(item.allergens.kitchenNotes)
  const [verifyNotes, setVerifyNotes] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const toggleTag = (tag: string) => {
    setTaste((prev) => ({
      ...prev,
      tags: prev.tags.includes(tag) ? prev.tags.filter((t) => t !== tag) : [...prev.tags, tag],
    }))
  }

  const saveSection = async (kind: 'serving' | 'taste' | 'allergen') => {
    setIsSaving(true)
    try {
      if (kind === 'serving') {
        if (!serving.meal_role) throw new Error('Vui lòng chọn vai trò món (meal role)')
        const min = Number(serving.people_min)
        const max = Number(serving.people_max)
        if (!Number.isInteger(min) || min < 1) throw new Error('Số người tối thiểu phải ≥ 1')
        if (!Number.isInteger(max) || max < min) throw new Error('Số người tối đa phải ≥ tối thiểu')
        await saveServing(item.id, {
          meal_role: serving.meal_role as MealRole,
          people_min: min,
          people_max: max,
          ...(serving.serving_unit.trim() ? { serving_unit: serving.serving_unit.trim() } : {}),
          ...(serving.serving_description.trim()
            ? { serving_description: serving.serving_description.trim() }
            : {}),
        })
      } else if (kind === 'taste') {
        await saveTaste(item.id, {
          ...(taste.spice_level !== '' ? { spice_level: Number(taste.spice_level) } : {}),
          ...(taste.richness_level !== '' ? { richness_level: Number(taste.richness_level) } : {}),
          taste_tags: taste.tags,
          dietary_tags: dietaryText
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean),
          pairing_item_ids: pairingIds,
        })
      } else {
        await saveAllergens(item.id, allergens, kitchenNotes)
      }
      notify('Đã lưu hồ sơ món', 'success')
      await onSaved()
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Lưu thất bại', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const verify = async () => {
    if (!verifyNotes.trim()) {
      notify('Xác minh của bếp bắt buộc có ghi chú kiểm nghiệm', 'error')
      return
    }
    setIsSaving(true)
    try {
      await verifyAllergens(item.id, verifyNotes.trim())
      notify('Đã xác minh dị ứng bởi bếp', 'success')
      setVerifyNotes('')
      await onSaved()
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Xác minh thất bại', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const pairingDishes = dishes.filter((d) => d.id !== item.id)
  const dietaryPlaceholder = 'VD: ít dầu, không bột ngọt (cách nhau bằng dấu phẩy)'

  return (
    <div className="space-y-4">
      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>Khẩu phần & vai trò món</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={labelClass} htmlFor="meal-role">Vai trò món</label>
            <select
              id="meal-role"
              className={inputClass}
              value={serving.meal_role}
              onChange={(e) => setServing({ ...serving, meal_role: e.target.value as MealRole | '' })}
            >
              <option value="">— Chọn vai trò —</option>
              {MEAL_ROLES.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="people-min">Phục vụ từ (người)</label>
            <input
              id="people-min"
              type="number"
              min={1}
              max={30}
              className={inputClass}
              value={serving.people_min}
              onChange={(e) => setServing({ ...serving, people_min: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="people-max">Đến (người)</label>
            <input
              id="people-max"
              type="number"
              min={1}
              max={30}
              className={inputClass}
              value={serving.people_max}
              onChange={(e) => setServing({ ...serving, people_max: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="serving-unit">Đơn vị (đĩa, nồi, phần…)</label>
            <input
              id="serving-unit"
              className={inputClass}
              value={serving.serving_unit}
              onChange={(e) => setServing({ ...serving, serving_unit: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="serving-desc">Mô tả khẩu phần</label>
            <input
              id="serving-desc"
              className={inputClass}
              placeholder="VD: 1 con gà / 550g sườn"
              value={serving.serving_description}
              onChange={(e) => setServing({ ...serving, serving_description: e.target.value })}
            />
          </div>
        </div>
        <button type="button" className={`${buttonPrimary} mt-3`} disabled={isSaving} onClick={() => void saveSection('serving')}>
          Lưu khẩu phần
        </button>
      </div>

      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>Vị & kết hợp món</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor="spice">Độ cay (0–2)</label>
            <select
              id="spice"
              className={inputClass}
              value={taste.spice_level}
              onChange={(e) => setTaste({ ...taste, spice_level: e.target.value })}
            >
              <option value="">— Chưa rõ —</option>
              <option value="0">0 — Không cay</option>
              <option value="1">1 — Cay vừa</option>
              <option value="2">2 — Cay nhiều</option>
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="richness">Độ béo (0–2)</label>
            <select
              id="richness"
              className={inputClass}
              value={taste.richness_level}
              onChange={(e) => setTaste({ ...taste, richness_level: e.target.value })}
            >
              <option value="">— Chưa rõ —</option>
              <option value="0">0 — Thanh nhẹ</option>
              <option value="1">1 — Vừa</option>
              <option value="2">2 — Béo đậm</option>
            </select>
          </div>
        </div>
        <p className={`${labelClass} mt-3`}>Thẻ vị</p>
        <div className="flex flex-wrap gap-2">
          {TASTE_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              aria-pressed={taste.tags.includes(tag)}
              onClick={() => toggleTag(tag)}
              className={`rounded-full px-3 py-1 text-xs font-semibold border ${
                taste.tags.includes(tag)
                  ? 'bg-[#2b2e2c] text-white border-[#2b2e2c]'
                  : 'bg-white text-[#5c5e5c] border-[#e2e3e3]'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
        <div className="mt-3">
          <label className={labelClass} htmlFor="dietary">Ghi chú ăn kiêng (phẩy)</label>
          <input
            id="dietary"
            className={inputClass}
            placeholder={dietaryPlaceholder}
            value={dietaryText}
            onChange={(e) => setDietaryText(e.target.value)}
          />
        </div>
        <div className="mt-3">
          <label className={labelClass} htmlFor="pairing">Món kết hợp</label>
          <div className="flex gap-2">
            <select
              id="pairing"
              className={inputClass}
              value={taste.pairingId}
              onChange={(e) => setTaste({ ...taste, pairingId: e.target.value })}
            >
              <option value="">— Thêm món kết hợp —</option>
              {pairingDishes.map((dish) => (
                <option key={dish.id} value={dish.id}>
                  {dish.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="rounded-lg border border-[#e2e3e3] px-3 text-sm font-semibold"
              disabled={!taste.pairingId || pairingIds.includes(taste.pairingId)}
              onClick={() => {
                if (taste.pairingId) setPairingIds([...pairingIds, taste.pairingId])
                setTaste({ ...taste, pairingId: '' })
              }}
            >
              Thêm
            </button>
          </div>
          {pairingIds.length > 0 && (
            <ul className="mt-2 space-y-1">
              {pairingIds.map((id) => (
                <li key={id} className="flex items-center justify-between text-sm">
                  <span>{dishes.find((d) => d.id === id)?.name ?? id}</span>
                  <button
                    type="button"
                    className="text-xs font-semibold text-red-700"
                    onClick={() => setPairingIds(pairingIds.filter((p) => p !== id))}
                  >
                    Gỡ
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button type="button" className={`${buttonPrimary} mt-3`} disabled={isSaving} onClick={() => void saveSection('taste')}>
          Lưu vị & kết hợp
        </button>
      </div>

      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>
          Dị ứng {item.allergens.verified ? (
            <span className="ml-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-800">
              ĐÃ XÁC MINH
            </span>
          ) : (
            <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
              CHƯA XÁC MINH
            </span>
          )}
        </h3>
        <div className="grid grid-cols-1 gap-2">
          {ALLERGEN_TYPES.map(({ value, label }) => (
            <div key={value} className="flex items-center justify-between gap-3">
              <span className="text-sm">{label}</span>
              <select
                aria-label={`Dị ứng ${label}`}
                className="w-40 rounded-lg border border-[#e2e3e3] bg-white px-2 py-1.5 text-sm"
                value={allergens[value] ?? 'unknown'}
                onChange={(e) =>
                  setAllergens({ ...allergens, [value]: e.target.value as AllergenStatus })
                }
              >
                {ALLERGEN_STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <label className={labelClass} htmlFor="kitchen-notes">Ghi chú bếp</label>
          <textarea
            id="kitchen-notes"
            rows={2}
            className={inputClass}
            value={kitchenNotes}
            onChange={(e) => setKitchenNotes(e.target.value)}
          />
        </div>
        <button type="button" className={`${buttonPrimary} mt-3`} disabled={isSaving} onClick={() => void saveSection('allergen')}>
          Lưu dị ứng
        </button>
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-bold text-amber-900">Xác minh bởi bếp (riêng biệt)</p>
          <p className="mt-1 text-xs text-amber-800">
            Bắt buộc có ghi chú kiểm nghiệm. Lưu dị ứng thông thường không bao giờ tự xác minh.
          </p>
          <textarea
            aria-label="Ghi chú kiểm nghiệm của bếp"
            rows={2}
            className={`${inputClass} mt-2`}
            placeholder="VD: Đã kiểm tra chảo riêng, dầu không nhiễm chéo…"
            value={verifyNotes}
            onChange={(e) => setVerifyNotes(e.target.value)}
          />
          <button
            type="button"
            className="mt-2 rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
            disabled={isSaving}
            onClick={() => void verify()}
          >
            Xác minh bởi bếp
          </button>
        </div>
      </div>
    </div>
  )
}
