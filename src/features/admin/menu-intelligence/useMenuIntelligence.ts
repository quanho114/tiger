// Tiger Admin — Menu Intelligence lifecycle (web-only).
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AdminMenuItem } from '../types'
import type { CoverageReport, ProfileDetail, ProfileStatus } from './types'
import { fetchCoverage, fetchMenuItems, fetchProfile } from './api'

export type DishFilter = 'needs' | 'ready' | 'verified' | 'all'

export interface DishRow {
  item: AdminMenuItem
  status: ProfileStatus | 'UNKNOWN'
}

export function dishFilterOf(status: ProfileStatus | 'UNKNOWN'): DishFilter | null {
  if (status === 'KITCHEN_VERIFIED') return 'verified'
  if (status === 'READY_FOR_RECOMMENDATION') return 'ready'
  if (status === 'EMPTY' || status === 'PARTIAL') return 'needs'
  return null
}

function filterOf(status: ProfileStatus | 'UNKNOWN'): DishFilter | null {
  return dishFilterOf(status)
}

export function useMenuIntelligence() {
  const [coverage, setCoverage] = useState<CoverageReport | null>(null)
  const [dishes, setDishes] = useState<AdminMenuItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<DishFilter>('needs')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ProfileDetail | null>(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [notice, setNotice] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const notify = useCallback((text: string, type: 'success' | 'error') => {
    setNotice({ text, type })
    if (type === 'success') {
      setTimeout(() => {
        setNotice((current) => (current?.text === text ? null : current))
      }, 5000)
    }
  }, [])

  const reload = useCallback(async () => {
    setIsLoading(true)
    try {
      const [report, items] = await Promise.all([fetchCoverage(), fetchMenuItems()])
      setCoverage(report)
      setDishes(items.filter((item) => item.published))
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Không tải được dữ liệu', 'error')
    } finally {
      setIsLoading(false)
    }
  }, [notify])

  useEffect(() => {
    void reload()
  }, [reload])

  const statusById: Map<string, ProfileStatus> = useMemo(() => {
    const map = new Map<string, ProfileStatus>()
    const entries: { id: string; status: ProfileStatus }[] = coverage?.items ?? []
    for (const entry of entries) map.set(entry.id, entry.status)
    return map
  }, [coverage])

  const rows: DishRow[] = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return dishes
      .map((item) => {
        const s = statusById.get(item.id)
        void s
        // NOTE: 'UNKNOWN' needs as const — otherwise it widens to string
        // inside the map callback and breaks DishRow inference.
        const status = (s ?? 'UNKNOWN') as DishRow['status']
        return { item, status }
      })
      .filter(({ item, status }) => {
        if (filter !== 'all' && filterOf(status) !== filter) return false
        if (keyword && !`${item.name} ${item.category_name ?? ''}`.toLowerCase().includes(keyword)) return false
        return true
      })
      .sort((a, b) => a.item.name.localeCompare(b.item.name, 'vi'))
  }, [dishes, statusById, filter, search])

  const selectDish = useCallback(
    async (id: string) => {
      setSelectedId(id)
      setDetail(null)
      setIsDetailLoading(true)
      try {
        setDetail(await fetchProfile(id))
      } catch (error) {
        notify(error instanceof Error ? error.message : 'Không tải được hồ sơ món', 'error')
      } finally {
        setIsDetailLoading(false)
      }
    },
    [notify]
  )

  const refreshDetail = useCallback(async () => {
    await reload()
    if (selectedId) {
      try {
        setDetail(await fetchProfile(selectedId))
      } catch (error) {
        notify(error instanceof Error ? error.message : 'Không tải được hồ sơ món', 'error')
      }
    }
  }, [reload, selectedId, notify])

  return {
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
  }
}
