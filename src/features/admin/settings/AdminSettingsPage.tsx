import { useState, useEffect, useCallback, type FC } from 'react'
import { Link } from 'react-router-dom'
import {
  Clock,
  UtensilsCrossed,
  Building2,
  ScrollText,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  X,
  ExternalLink,
  Bot,
} from 'lucide-react'
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
import { ConciergeLlmSection } from './ConciergeLlmSection'

type TabKey = 'operations' | 'menu' | 'areas' | 'feedback' | 'chatbot'

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
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-slate-500 font-medium">Đang tải cấu hình & danh mục quán...</p>
      </div>
    )
  }

  const newFeedbackCount = feedbacks.filter((f) => f.status === 'NEW').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Cài Đặt & Cấu Hình Quán
            </h1>
            {settings && (
              <span className="font-mono text-xs text-blue-700 bg-blue-50 border border-blue-200/60 px-2 py-0.5 rounded-md font-semibold">
                v{settings.version}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Điều chỉnh giờ phục vụ, phí vận chuyển, khu vực chỗ ngồi và nhật ký vận hành
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadData()}
          disabled={isLoading}
          className="self-start sm:self-auto px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/80 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-600' : 'text-slate-400'}`} />
          <span>Làm mới</span>
        </button>
      </div>

      {/* Global Notification Banner */}
      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between shadow-xs transition-all ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span className="font-medium">{statusMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-slate-400 hover:text-slate-600 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Modern Tabs Navigation */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200/80 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('operations')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'operations'
              ? 'bg-blue-600 text-white shadow-2xs'
              : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Vận Hành & Giờ Mở Cửa</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('menu')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'menu'
              ? 'bg-blue-600 text-white shadow-2xs'
              : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <UtensilsCrossed className="w-3.5 h-3.5" />
          <span>Thực Đơn & Danh Mục</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              activeTab === 'menu' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {menuItems.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('areas')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'areas'
              ? 'bg-blue-600 text-white shadow-2xs'
              : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>Khu Vực & Phí Vận Chuyển</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              activeTab === 'areas' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {seatingAreas.length}/{deliveryZones.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('feedback')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'feedback'
              ? 'bg-blue-600 text-white shadow-2xs'
              : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <ScrollText className="w-3.5 h-3.5" />
          <span>Phản Hồi & Nhật Ký</span>
          {newFeedbackCount > 0 && (
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === 'feedback'
                  ? 'bg-white/20 text-white'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}
            >
              {newFeedbackCount} mới
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('chatbot')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'chatbot'
              ? 'bg-blue-600 text-white shadow-2xs'
              : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <Bot className="w-3.5 h-3.5" />
          <span>Chatbot AI</span>
        </button>
      </div>

      {/* Dedicated Menu Page Notice Banner */}
      {activeTab === 'menu' && (
        <div className="bg-blue-50/60 border border-blue-200/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
              <UtensilsCrossed className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900">
                Trang Quản Lý Thực Đơn Nâng Cao (/admin/menu)
              </div>
              <div className="text-[11px] text-slate-600">
                Tìm kiếm, lọc danh mục và cập nhật trạng thái món trực quan dành riêng cho giờ cao điểm.
              </div>
            </div>
          </div>
          <Link
            to="/admin/menu"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-2xs transition shrink-0"
          >
            <span>Mở Trang Thực Đơn</span>
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      )}

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

        {activeTab === 'chatbot' && <ConciergeLlmSection onNotify={notify} />}
      </div>
    </div>
  )
}
