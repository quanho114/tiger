import type { TableSession } from './types'

const TABLE_SESSION_KEY = 'tiger_table_session_v1'

export function getStoredTableSession(): TableSession | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.sessionStorage.getItem(TABLE_SESSION_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<TableSession>
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !parsed.tableId ||
      !parsed.tableCode ||
      !parsed.visitId ||
      !parsed.visitCapability ||
      !parsed.expiresAt
    ) {
      window.sessionStorage.removeItem(TABLE_SESSION_KEY)
      return null
    }

    // Check expiration
    const expiryTime = new Date(parsed.expiresAt).getTime()
    if (Number.isNaN(expiryTime) || expiryTime <= Date.now()) {
      window.sessionStorage.removeItem(TABLE_SESSION_KEY)
      return null
    }

    return {
      tableId: parsed.tableId,
      tableCode: parsed.tableCode,
      tableName: parsed.tableName || parsed.tableCode,
      visitId: parsed.visitId,
      visitCapability: parsed.visitCapability,
      expiresAt: parsed.expiresAt,
    }
  } catch {
    try {
      window.sessionStorage.removeItem(TABLE_SESSION_KEY)
    } catch {
      // Ignore sessionStorage security/disabled errors
    }
    return null
  }
}

export function setStoredTableSession(session: TableSession): void {
  if (typeof window === 'undefined') return

  try {
    window.sessionStorage.setItem(TABLE_SESSION_KEY, JSON.stringify(session))
  } catch {
    // Ignore quota or disabled storage error
  }
}

export function clearStoredTableSession(): void {
  if (typeof window === 'undefined') return

  try {
    window.sessionStorage.removeItem(TABLE_SESSION_KEY)
  } catch {
    // Ignore
  }
}
