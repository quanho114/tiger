import { publicApi } from '@/lib/api/client'
import type { MenuResponse, RestaurantSettings } from './types'

export interface GetMenuParams {
  mode?: 'dine_in' | 'delivery'
  category?: string
}

export async function fetchMenu(params?: GetMenuParams): Promise<MenuResponse> {
  const searchParams = new URLSearchParams()
  if (params?.mode) {
    searchParams.set('mode', params.mode)
  }
  if (params?.category) {
    searchParams.set('category', params.category)
  }

  const queryString = searchParams.toString()
  const path = `/menu${queryString ? `?${queryString}` : ''}`
  const response = await publicApi.get<MenuResponse>(path)
  return response.data
}

export async function fetchSettings(): Promise<RestaurantSettings> {
  const response = await publicApi.get<RestaurantSettings>('/settings')
  return response.data
}
