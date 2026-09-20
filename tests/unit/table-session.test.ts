import { describe, it, expect, beforeEach } from 'vitest'
import {
  getStoredTableSession,
  setStoredTableSession,
  clearStoredTableSession,
} from '@/features/table-session/storage'
import type { TableSession } from '@/features/table-session/types'

describe('Table Session Isolation & Storage (Invariant V13)', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    window.localStorage.clear()
  })

  it('stores session exclusively in sessionStorage, never in localStorage', () => {
    const session: TableSession = {
      tableId: 'tbl-vip-01',
      tableCode: 'VIP01',
      tableName: 'Phòng VIP 01',
      visitId: 'visit-999',
      visitCapability: 'cap-signed-hmac-token',
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    }

    setStoredTableSession(session)

    // Stored in sessionStorage
    expect(window.sessionStorage.getItem('tiger_table_session_v1')).not.toBeNull()
    // Strictly NOT in localStorage
    expect(window.localStorage.getItem('tiger_table_session_v1')).toBeNull()
    expect(window.localStorage.getItem('table_session')).toBeNull()

    const retrieved = getStoredTableSession()
    expect(retrieved).not.toBeNull()
    expect(retrieved?.tableCode).toBe('VIP01')
    expect(retrieved?.visitCapability).toBe('cap-signed-hmac-token')
  })

  it('safely discards and clears session if expiresAt is in the past', () => {
    const expiredSession = {
      tableId: 'tbl-vip-01',
      tableCode: 'VIP01',
      tableName: 'Phòng VIP 01',
      visitId: 'visit-999',
      visitCapability: 'cap-signed-hmac-token',
      expiresAt: new Date(Date.now() - 60 * 1000).toISOString(), // Expired 1 min ago
    }
    window.sessionStorage.setItem('tiger_table_session_v1', JSON.stringify(expiredSession))

    const retrieved = getStoredTableSession()
    expect(retrieved).toBeNull()
    expect(window.sessionStorage.getItem('tiger_table_session_v1')).toBeNull()
  })

  it('safely handles malformed JSON in sessionStorage without throwing', () => {
    window.sessionStorage.setItem('tiger_table_session_v1', 'INVALID_JSON_CORRUPT{')

    expect(() => {
      const retrieved = getStoredTableSession()
      expect(retrieved).toBeNull()
    }).not.toThrow()
    expect(window.sessionStorage.getItem('tiger_table_session_v1')).toBeNull()
  })

  it('safely handles missing critical fields in sessionStorage payload', () => {
    const incomplete = {
      tableId: 'tbl-1',
      // missing tableCode, visitCapability, visitId
    }
    window.sessionStorage.setItem('tiger_table_session_v1', JSON.stringify(incomplete))

    const retrieved = getStoredTableSession()
    expect(retrieved).toBeNull()
    expect(window.sessionStorage.getItem('tiger_table_session_v1')).toBeNull()
  })

  it('clears stored session correctly', () => {
    const session: TableSession = {
      tableId: 'tbl-1',
      tableCode: 'B01',
      tableName: 'Bàn 01',
      visitId: 'v-1',
      visitCapability: 'cap-1',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    }
    setStoredTableSession(session)
    expect(window.sessionStorage.getItem('tiger_table_session_v1')).not.toBeNull()

    clearStoredTableSession()
    expect(window.sessionStorage.getItem('tiger_table_session_v1')).toBeNull()
  })
})
