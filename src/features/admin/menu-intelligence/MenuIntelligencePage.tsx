// Tiger Admin — Menu Intelligence curation page (web-only).
import type { FC } from 'react'
import { AlertCircle, Bot, CheckCircle2, Search, Sparkles } from 'lucide-react'
import { useMenuIntelligence, type DishFilter } from './useMenuIntelligence'
import type { ProfileStatus } from './types'
import { ProfileEditor } from './components/ProfileEditor'
import { DraftReview } from './components/DraftReview'
import { AdminLoading } from '../components/AdminLoading'

const STATUS_LABEL: Record<ProfileStatus | 'UNKNOWN', string> = {
  EMPTY: 'Chưa có hồ sơ',
  PARTIAL: 'Một phần',
  READY_FOR_RECOMMENDATION: 'Sẵn sàng',
  KITCHEN_VERIFIED: 'Bếp đã duyệt',
  UNKNOWN: '—',
}

const STATUS_BADGE: Record<ProfileStatus | 'UNKNOWN', string> = {
  EMPTY: 'bg-gray-100 text-gray-700',
  PARTIAL: 'bg-amber-100 text-amber-800',
  READY_FOR_RECOMMENDATION: 'bg-blue-100 text-blue-800',
  KITCHEN_VERIFIED: 'bg-green-100 text-green-800',
  UNKNOWN: 'bg-gray-50 text-gray-400',
}

const FILTERS: { value: DishFilter; label: string }[] = [
  { value: 'needs', label: 'Cần hồ sơ' },
  { value: 'ready', label: 'Sẵn sàng' },
  { value: 'verified', label: 'Bếp đã duyệt' },
  { value: 'all', label: 'Tất cả' },
]

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-[#e2e3e3] bg-white px-4 py-3">
      <p className="text-xs font-semibold text-[#5c5e5c]">{label}</p>
      <p className="mt-1 text-2xl font-black text-[#171a17]">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-[#787979]">{sub}</p>}
    </div>
  )
}

export const AdminMenuIntelligencePage: FC = () => {
  const {
    coverage,
    rows,
    dishes,
    isLoading,
    filter,
    setFilter,
    search,
    setSearch,
    selectedId,
    selectDish,
    detail,
    isDetailLoading,
    notice,
    notify,
    refreshDetail,
  } = useMenuIntelligence()

  const selected = rows.find((row) => row.item.id === selectedId) ?? null

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black text-[#171a17]">Menu Intelligence</h1>
        <p className="text-sm text-[#5c5e5c]">
          Hồ sơ AI cho thực đơn: khẩu phần, vị, ghép món, dị ứng. Dữ liệu an toàn chỉ bếp mới được xác minh.
        </p>
      </div>

      {notice && (
        <div
          role="alert"
          className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold ${
            notice.type === 'success'
              ? 'border-green-300 bg-green-50 text-green-900'
              : 'border-red-300 bg-red-50 text-red-900'
          }`}
        >
          {notice.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {notice.text}
        </div>
      )}

      {isLoading || !coverage ? (
        <AdminLoading />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Món đã đăng" value={coverage.published} />
            <Stat label="Sẵn sàng gợi ý" value={coverage.ready} sub={`${coverage.mealRolePct}% có vai trò món`} />
            <Stat label="Bếp đã duyệt" value={coverage.kitchenVerified} />
            <Stat label="Cần hồ sơ" value={coverage.empty + coverage.partial} sub={`${coverage.empty} trống hoàn toàn`} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold border ${
                  filter === value
                    ? 'bg-[#2b2e2c] text-white border-[#2b2e2c]'
                    : 'bg-white text-[#5c5e5c] border-[#e2e3e3]'
                }`}
              >
                {label}
              </button>
            ))}
            <div className="relative ml-auto w-full md:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#787979]" />
              <input
                aria-label="Tìm món"
                className="w-full rounded-lg border border-[#e2e3e3] bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#2b2e2c]"
                placeholder="Tìm món…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-[#e2e3e3] bg-white">
              <p className="border-b border-[#e2e3e3] px-4 py-3 text-sm font-bold">
                Món ăn ({rows.length})
              </p>
              <ul className="max-h-[640px] divide-y divide-[#f0f1f0] overflow-y-auto">
                {rows.map(({ item, status }) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => void selectDish(item.id)}
                      aria-current={selectedId === item.id}
                      className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm hover:bg-[#f7f8f7] ${
                        selectedId === item.id ? 'bg-[#f0f4ef]' : ''
                      }`}
                    >
                      <span>
                        <span className="block font-semibold text-[#171a17]">{item.name}</span>
                        <span className="block text-xs text-[#787979]">{item.category_name ?? ''}</span>
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_BADGE[status]}`}>
                        {STATUS_LABEL[status]}
                      </span>
                    </button>
                  </li>
                ))}
                {rows.length === 0 && (
                  <li className="px-4 py-6 text-sm text-[#787979]">Không có món nào khớp bộ lọc.</li>
                )}
              </ul>
            </div>

            <div className="space-y-4 lg:col-span-2">
              {!selected ? (
                <div className="rounded-xl border border-dashed border-[#e2e3e3] bg-white p-8 text-center text-sm text-[#787979]">
                  Chọn một món bên trái để xem và chỉnh hồ sơ AI.
                </div>
              ) : isDetailLoading || !detail || detail.item.id !== selected.item.id ? (
                <AdminLoading />
              ) : (
                <>
                  <div className="rounded-xl border border-[#e2e3e3] bg-white p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-black text-[#171a17]">{selected.item.name}</h2>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_BADGE[detail.status]}`}>
                        {STATUS_LABEL[detail.status]}
                      </span>
                    </div>
                    {detail.warnings.length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {detail.warnings.map((warning) => (
                          <li
                            key={warning}
                            className="rounded bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800"
                          >
                            {warning}
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-2 text-xs text-[#787979]">
                      Nguồn: khẩu phần ({detail.item.sources.serving}) · vị ({detail.item.sources.taste}) ·
                      dị ứng ({detail.item.sources.allergen})
                    </p>
                  </div>

                  <ProfileEditor
                    key={detail.item.id}
                    dishes={dishes}
                    detail={detail}
                    onSaved={refreshDetail}
                    notify={notify}
                  />
                  <DraftReview
                    itemId={detail.item.id}
                    itemName={selected.item.name}
                    current={{
                      mealRole: detail.item.serving.mealRole ?? '',
                      serving:
                        detail.item.serving.peopleMin != null
                          ? `${detail.item.serving.peopleMin}–${detail.item.serving.peopleMax ?? '?'} người`
                          : '',
                      spice: detail.item.taste.spiceLevel != null ? String(detail.item.taste.spiceLevel) : '',
                      taste: detail.item.taste.tags.join(', '),
                      pairing: '',
                    }}
                    onApplied={refreshDetail}
                    notify={notify}
                  />
                </>
              )}
            </div>
          </div>

          <p className="flex items-center gap-1.5 text-xs text-[#787979]">
            <Bot className="h-3.5 w-3.5" />
            Gợi ý AI chỉ là bản nháp. Dị ứng và an toàn bếp luôn cần người xác minh riêng.
            <Sparkles className="h-3.5 w-3.5" />
          </p>
        </>
      )}
    </div>
  )
}
