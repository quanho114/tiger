export interface TableSession {
  tableId: string
  tableCode: string
  tableName: string
  visitId: string
  visitCapability: string
  expiresAt: string
}

export interface TableResolveResponse {
  table_id: string
  table_code: string
  table_name: string
  visit_id: string
  visit_capability: string
  expires_at: string
}
