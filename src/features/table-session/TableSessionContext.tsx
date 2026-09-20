import { createContext, useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { publicApi } from '@/lib/api/client'
import { ApiError } from '@/lib/api/types'
import {
  clearStoredTableSession,
  getStoredTableSession,
  setStoredTableSession,
} from './storage'
import type { TableResolveResponse, TableSession } from './types'

export interface TableSessionContextValue {
  session: TableSession | null
  isLoading: boolean
  error: string | null
  hasActiveTable: boolean
  resolveToken: (token: string) => Promise<TableSession>
  clearSession: () => void
  setSessionExplicitly: (session: TableSession) => void
}

export const TableSessionContext = createContext<TableSessionContextValue | null>(null)

export function TableSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<TableSession | null>(() => getStoredTableSession())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-verify session expiration periodically
  useEffect(() => {
    if (!session) return

    const expiryTime = new Date(session.expiresAt).getTime()
    const remainingMs = expiryTime - Date.now()

    if (remainingMs <= 0) {
      clearStoredTableSession()
      setSession(null)
      return
    }

    const timer = setTimeout(() => {
      clearStoredTableSession()
      setSession(null)
    }, remainingMs)

    return () => clearTimeout(timer)
  }, [session])

  const resolveToken = useCallback(async (token: string): Promise<TableSession> => {
    setIsLoading(true)
    setError(null)

    try {
      const res = await publicApi.post<TableResolveResponse>('/tables/resolve', { token })
      const data = res.data

      const newSession: TableSession = {
        tableId: data.table_id,
        tableCode: data.table_code,
        tableName: data.table_name || data.table_code,
        visitId: data.visit_id,
        visitCapability: data.visit_capability,
        expiresAt: data.expires_at,
      }

      setStoredTableSession(newSession)
      setSession(newSession)
      return newSession
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'VISIT_CLOSED') {
          setError('Bàn chưa mở phiên phục vụ hoặc phiên đã kết thúc. Vui lòng liên hệ nhân viên.')
        } else if (err.code === 'TABLE_NOT_FOUND' || err.code === 'QR_TOKEN_INVALID') {
          setError('Mã QR bàn không hợp lệ hoặc đã bị thay đổi.')
        } else {
          setError(err.message || 'Không thể xác thực bàn.')
        }
      } else {
        setError('Có lỗi khi kết nối với hệ thống nhà hàng.')
      }
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  const clearSession = useCallback(() => {
    clearStoredTableSession()
    setSession(null)
    setError(null)
  }, [])

  const setSessionExplicitly = useCallback((newSession: TableSession) => {
    setStoredTableSession(newSession)
    setSession(newSession)
    setError(null)
  }, [])

  const value = useMemo<TableSessionContextValue>(() => ({
    session,
    isLoading,
    error,
    hasActiveTable: Boolean(session && session.visitCapability),
    resolveToken,
    clearSession,
    setSessionExplicitly,
  }), [session, isLoading, error, resolveToken, clearSession, setSessionExplicitly])

  return (
    <TableSessionContext.Provider value={value}>
      {children}
    </TableSessionContext.Provider>
  )
}
