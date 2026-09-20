import { useState, useEffect, useCallback, type FC } from 'react'
import { adminApi } from '../../../lib/api/client'
import { useAdmin } from '../layout/AdminContext'
import type {
  AdminRestaurantSettings,
  AdminCategory,
  AdminMenuItem,
  AdminBusinessHour,
  AdminBusinessClosure,
  AdminSeatingArea,
  AdminDeliveryZone,
  AdminConciergeFeedback,
  AdminAuditLog,
} from '../types'
import { OperationsHoursSection } from './OperationsHoursSection'
import { MenuContentSection } from './MenuContentSection'
import { AreasZonesSection } from './AreasZonesSection'
import { FeedbackAuditSection } from './FeedbackAuditSection'

type TabKey = 'operations' | 'menu' | 'areas' | 'feedback'

function extractItems<T>(raw: { items?: T[]; data?: T[] } | T[] | null | undefined): T[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  if (Array.isArray(raw.items)) return raw.items
  if (Array.isArray(raw.data)) return raw.data
  return []
}

export const AdminSettingsPage: FC = () => {
  const { refreshKey } = useAdmin()

  const [activeTab, setActiveTab] = useState<TabKey>('operations')
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  // Data states
  const [settings, setSettings] = useState<AdminRestaurantSettings | null>(null)
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [menuItems, setMenuItems] = useState<AdminMenuItem[]>([])
  const [businessHours, setBusinessHours] = useState<AdminBusinessHour[]>([])
  const [businessClosures, setBusinessClosures] = useState<AdminBusinessClosure[]>([])
  const [seatingAreas, setSeatingAreas] = useState<AdminSeatingArea[]>([])
  const [deliveryZones, setDeliveryZones] = useState<AdminDeliveryZone[]>([])
  const [feedbacks, setFeedbacks] = useState<AdminConciergeFeedback[]>([])
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([])

  const notify = (text: string, type: 'success' | 'error') => {
    setStatusMessage({ text, type })
    if (type === 'success') {
      setTimeout(() => {
        setStatusMessage((current) => (current?.text === text ? null : current))
      }, 5000)
    }
  }

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true)
      const [
        settingsRes,
        categoriesRes,
        itemsRes,
        hoursRes,
        closuresRes,
        areasRes,
        zonesRes,
        feedbackRes,
        auditRes,
      ] = await Promise.all([
        adminApi.get<AdminRestaurantSettings>('/settings'),
        adminApi.get<{ items: AdminCategory[] } | AdminCategory[]>('/categories').catch(() => ({ data: [] })),
        adminApi.get<{ items: AdminMenuItem[] } | AdminMenuItem[]>('/menu-items').catch(() => ({ data: [] })),
        adminApi.get<{ items: AdminBusinessHour[] } | AdminBusinessHour[]>('/settings/hours').catch(() => ({ data: [] })),
        adminApi.get<{ items: AdminBusinessClosure[] } | AdminBusinessClosure[]>('/settings/closures').catch(() => ({ data: [] })),
        adminApi.get<{ items: AdminSeatingArea[] } | AdminSeatingArea[]>('/seating-areas').catch(() => ({ data: [] })),
        adminApi.get<{ items: AdminDeliveryZone[] } | AdminDeliveryZone[]>('/delivery-zones').catch(() => ({ data: [] })),
        adminApi.get<{ data: AdminConciergeFeedback[] } | AdminConciergeFeedback[]>('/concierge/feedback').catch(() => ({ data: [] })),
        adminApi.get<{ items: AdminAuditLog[] } | AdminAuditLog[]>('/audit').catch(() => ({ data: [] })),
      ])

      setSettings(settingsRes.data)
      setCategories(extractItems<AdminCategory>(categoriesRes.data))
      setMenuItems(extractItems<AdminMenuItem>(itemsRes.data))
      setBusinessHours(extractItems<AdminBusinessHour>(hoursRes.data))
      setBusinessClosures(extractItems<AdminBusinessClosure>(closuresRes.data))
      setSeatingAreas(extractItems<AdminSeatingArea>(areasRes.data))
      setDeliveryZones(extractItems<AdminDeliveryZone>(zonesRes.data))
      setFeedbacks(extractItems<AdminConciergeFeedback>(feedbackRes.data))
      setAuditLogs(extractItems<AdminAuditLog>(auditRes.data))
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Không thể tải cấu hình quán', 'error')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData, refreshKey])

  if (isLoading && !settings) {
    return (
      <div className="py-24 flex flex-col items-center justify-center space-y-3">
        <div className="w-9 h-9 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-stone-400 font-medium">Đang tải cấu hình & danh mục quán...</p>
      </div>
    )
  }

  const newFeedbackCount = feedbacks.filter((f) => f.status === 'NEW').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-stone-100 tracking-tight">
              Cấu Hình & Quản Trị Nội Dung
            </h1>
            {settings && (
              <span className="font-mono text-xs text-amber-400 bg-amber-950/60 border border-amber-800/80 px-2 py-0.5 rounded-md font-semibold">
                v{settings.version}
              </span>
            )}
          </div>
          <p className="text-xs text-stone-400 mt-1">
            Quản lý giờ hoạt động, thực đơn, khu vực bàn, vùng giao hàng và nhật ký kiểm toán hệ thống
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadData()}
          disabled={isLoading}
          className="self-start sm:self-auto px-3.5 py-1.5 bg-stone-900 hover:bg-stone-800 text-stone-300 border border-stone-700/80 rounded-xl text-xs font-semibold transition flex items-center gap-1.5"
        >
          {isLoading ? (
            <span className="w-3.5 h-3.5 border-2 border-stone-300 border-t-transparent rounded-full animate-spin" />
          ) : (
            <span>⟳ Làm mới</span>
          )}
        </button>
      </div>

      {/* Global Notification Banner */}
      {statusMessage && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-center justify-between shadow-lg transition-all ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-800 text-emerald-200 shadow-emerald-950/20'
              : 'bg-rose-950/80 border-rose-800 text-rose-200 shadow-rose-950/20'
          }`}
        >
          <div className="flex items-center gap-2">
            <span>{statusMessage.type === 'success' ? '✓' : '⚠'}</span>
            <span className="font-medium">{statusMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-stone-400 hover:text-white px-2 py-1 font-bold text-sm"
          >
            ✕
          </button>
        </div>
      )}

      {/* Modern Tabs Navigation */}
      <div className="flex flex-wrap gap-2 border-b border-stone-800/80 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('operations')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'operations'
              ? 'bg-amber-500 text-stone-950 shadow-md shadow-amber-500/10'
              : 'bg-stone-900 text-stone-300 border border-stone-800 hover:bg-stone-850 hover:text-white'
          }`}
        >
          <span>⚡ Vận Hành & Giờ Mở Cửa</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('menu')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'menu'
              ? 'bg-amber-500 text-stone-950 shadow-md shadow-amber-500/10'
              : 'bg-stone-900 text-stone-300 border border-stone-800 hover:bg-stone-850 hover:text-white'
          }`}
        >
          <span>🍲 Thực Đơn & Danh Mục</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              activeTab === 'menu' ? 'bg-stone-950/30 text-stone-950' : 'bg-stone-800 text-stone-400'
            }`}
          >
            {menuItems.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('areas')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'areas'
              ? 'bg-amber-500 text-stone-950 shadow-md shadow-amber-500/10'
              : 'bg-stone-900 text-stone-300 border border-stone-800 hover:bg-stone-850 hover:text-white'
          }`}
        >
          <span>🪑 Khu Vực & Phí Vận Chuyển</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              activeTab === 'areas' ? 'bg-stone-950/30 text-stone-950' : 'bg-stone-800 text-stone-400'
            }`}
          >
            {seatingAreas.length}/{deliveryZones.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('feedback')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'feedback'
              ? 'bg-amber-500 text-stone-950 shadow-md shadow-amber-500/10'
              : 'bg-stone-900 text-stone-300 border border-stone-800 hover:bg-stone-850 hover:text-white'
          }`}
        >
          <span>📋 Phản Hồi & Nhật Ký</span>
          {newFeedbackCount > 0 && (
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === 'feedback'
                  ? 'bg-rose-950 text-rose-200'
                  : 'bg-rose-500 text-white animate-pulse'
              }`}
            >
              {newFeedbackCount} mới
            </span>
          )}
        </button>
      </div>

      {/* Tab Panels */}
      <div>
        {activeTab === 'operations' && (
          <OperationsHoursSection
            settings={settings}
            businessHours={businessHours}
            businessClosures={businessClosures}
            onReload={loadData}
            onNotify={notify}
          />
        )}

        {activeTab === 'menu' && (
          <MenuContentSection
            categories={categories}
            menuItems={menuItems}
            onReload={loadData}
            onNotify={notify}
          />
        )}

        {activeTab === 'areas' && (
          <AreasZonesSection
            seatingAreas={seatingAreas}
            deliveryZones={deliveryZones}
            onReload={loadData}
            onNotify={notify}
          />
        )}

        {activeTab === 'feedback' && (
          <FeedbackAuditSection
            feedbackList={feedbacks}
            auditLogs={auditLogs}
            onReload={loadData}
            onNotify={notify}
          />
        )}
      </div>
    </div>
  )
}
