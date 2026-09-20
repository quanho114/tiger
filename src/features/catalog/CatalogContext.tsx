import { createContext } from 'react'
import type { Category, MenuItem, RestaurantSettings } from './types'

export interface CatalogContextValue {
  categories: Category[]
  items: MenuItem[]
  settings: RestaurantSettings | null
  isLoadingMenu: boolean
  isLoadingSettings: boolean
  isLoading: boolean
  menuError: string | null
  settingsError: string | null
  isError: boolean
  error: Error | null
  refetchMenu: () => Promise<void>
  refetchSettings: () => Promise<void>
  refreshMenu: () => Promise<void>
  refreshSettings: () => Promise<void>
  featuredItems: MenuItem[]
  getItemById: (id: string) => MenuItem | undefined
  getItemsByCategory: (categoryId: string) => MenuItem[]
  getCategoryBySlug: (slug: string) => Category | undefined
}

export const CatalogContext = createContext<CatalogContextValue | null>(null)
