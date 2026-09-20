import { useState, useEffect, useCallback, useMemo, type ReactNode, type FC } from 'react'
import { CatalogContext, type CatalogContextValue } from './CatalogContext'
import { fetchMenu, fetchSettings } from './api'
import type { Category, MenuItem, RestaurantSettings } from './types'

export interface CatalogProviderProps {
  children: ReactNode
}

export const CatalogProvider: FC<CatalogProviderProps> = ({ children }) => {
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [settings, setSettings] = useState<RestaurantSettings | null>(null)

  const [isLoadingMenu, setIsLoadingMenu] = useState(true)
  const [isLoadingSettings, setIsLoadingSettings] = useState(true)

  const [menuError, setMenuError] = useState<string | null>(null)
  const [settingsError, setSettingsError] = useState<string | null>(null)

  const loadMenu = useCallback(async () => {
    setIsLoadingMenu(true)
    setMenuError(null)
    try {
      const data = await fetchMenu()
      setCategories(data.categories)
      setItems(data.items)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể tải danh mục thực đơn'
      setMenuError(msg)
      setCategories([])
      setItems([])
    } finally {
      setIsLoadingMenu(false)
    }
  }, [])

  const loadSettings = useCallback(async () => {
    setIsLoadingSettings(true)
    setSettingsError(null)
    try {
      const data = await fetchSettings()
      setSettings(data)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể tải thông tin nhà hàng'
      setSettingsError(msg)
      setSettings(null)
    } finally {
      setIsLoadingSettings(false)
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const initialize = async () => {
      try {
        const [menuData, settingsData] = await Promise.all([
          fetchMenu().catch((err: unknown) => {
            if (isMounted) {
              const msg = err instanceof Error ? err.message : 'Không thể tải danh mục thực đơn'
              setMenuError(msg)
            }
            return null
          }),
          fetchSettings().catch((err: unknown) => {
            if (isMounted) {
              const msg = err instanceof Error ? err.message : 'Không thể tải thông tin nhà hàng'
              setSettingsError(msg)
            }
            return null
          }),
        ])

        if (!isMounted) return

        if (menuData) {
          setCategories(menuData.categories)
          setItems(menuData.items)
        }
        if (settingsData) {
          setSettings(settingsData)
        }
      } finally {
        if (isMounted) {
          setIsLoadingMenu(false)
          setIsLoadingSettings(false)
        }
      }
    }

    void initialize()

    return () => {
      isMounted = false
    }
  }, [])

  const featuredItems = useMemo(() => {
    return items
      .filter((item) => item.is_featured)
      .sort((a, b) => {
        const rankA = a.featured_rank ?? 999
        const rankB = b.featured_rank ?? 999
        return rankA - rankB
      })
  }, [items])

  const getItemById = useCallback(
    (id: string) => items.find((item) => item.id === id),
    [items]
  )

  const getItemsByCategory = useCallback(
    (categoryId: string) => items.filter((item) => item.category_id === categoryId),
    [items]
  )

  const getCategoryBySlug = useCallback(
    (slug: string) => categories.find((cat) => cat.slug === slug),
    [categories]
  )

  const isError = Boolean(menuError || settingsError)
  const error = useMemo(() => {
    if (menuError) return new Error(menuError)
    if (settingsError) return new Error(settingsError)
    return null
  }, [menuError, settingsError])

  const contextValue: CatalogContextValue = useMemo(
    () => ({
      categories,
      items,
      settings,
      isLoadingMenu,
      isLoadingSettings,
      isLoading: isLoadingMenu || isLoadingSettings,
      menuError,
      settingsError,
      isError,
      error,
      refetchMenu: loadMenu,
      refetchSettings: loadSettings,
      refreshMenu: loadMenu,
      refreshSettings: loadSettings,
      featuredItems,
      getItemById,
      getItemsByCategory,
      getCategoryBySlug,
    }),
    [
      categories,
      items,
      settings,
      isLoadingMenu,
      isLoadingSettings,
      menuError,
      settingsError,
      isError,
      error,
      loadMenu,
      loadSettings,
      featuredItems,
      getItemById,
      getItemsByCategory,
      getCategoryBySlug,
    ]
  )

  return (
    <CatalogContext.Provider value={contextValue}>
      {children}
    </CatalogContext.Provider>
  )
}
