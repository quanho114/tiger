/**
 * Tiger 345 - Edge Functions HTTP Smoke Test Suite (F01 Remediation)
 * Verifies real HTTP invocation against local Supabase Edge Functions runtime via Kong Gateway.
 * Tests guest public-api, customer-api auth gate, admin-api auth gate, and CORS headers.
 */

import { describe, it, expect, beforeAll } from 'vitest'

const EDGE_BASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'

describe('F01: Edge Runtime & HTTP API Smoke Tests (Real Kong Gateway)', () => {
  let isEdgeRuntimeLive = false

  beforeAll(async () => {
    try {
      const res = await fetch(`${EDGE_BASE_URL}/functions/v1/public-api/health`, {
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) {
        isEdgeRuntimeLive = true
      }
    } catch {
      isEdgeRuntimeLive = false
    }
  })

  it('verifies Edge Runtime is reachable on local Supabase port 54321', () => {
    expect(isEdgeRuntimeLive, 'Edge Runtime must be active and serving on port 54321').toBe(true)
  })

  describe('public-api (Guest Gateway)', () => {
    it('GET /functions/v1/public-api/health returns 200 with guest actor', async () => {
      const res = await fetch(`${EDGE_BASE_URL}/functions/v1/public-api/health`)
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('application/json')
      expect(res.headers.get('x-request-id')).toBeTruthy()

      const json = await res.json()
      expect(json.data.status).toBe('ok')
      expect(json.data.service).toBe('public-api')
      expect(json.data.actor.role).toBe('guest')
      expect(json.data.actor.userId).toBeNull()
    })

    it('OPTIONS /functions/v1/public-api/menu handles CORS preflight correctly', async () => {
      const res = await fetch(`${EDGE_BASE_URL}/functions/v1/public-api/menu`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:5173',
          'Access-Control-Request-Method': 'GET',
        },
      })
      expect([200, 204]).toContain(res.status)
      expect(res.headers.get('access-control-allow-origin')).toBe('*')
      expect(res.headers.get('access-control-allow-methods')).toContain('GET')
    })

    it('GET /functions/v1/public-api/menu returns categories and menu items from PostgreSQL', async () => {
      const res = await fetch(`${EDGE_BASE_URL}/functions/v1/public-api/menu`)
      expect(res.status).toBe(200)

      const json = await res.json()
      expect(json.data).toBeDefined()
      expect(Array.isArray(json.data.categories)).toBe(true)
      expect(json.data.categories.length).toBeGreaterThan(0)

      const firstCat = json.data.categories[0]
      expect(firstCat).toHaveProperty('id')
      expect(firstCat).toHaveProperty('name')
      expect(firstCat).toHaveProperty('slug')
    })

    it('GET /functions/v1/public-api/settings returns business hours, closures and delivery zones', async () => {
      const res = await fetch(`${EDGE_BASE_URL}/functions/v1/public-api/settings`)
      expect(res.status).toBe(200)

      const json = await res.json()
      expect(json.data).toBeDefined()
      expect(json.data.name).toBe('Tiger 345')
      expect(json.data.phone).toBe('0902809929')
      expect(Array.isArray(json.data.business_hours)).toBe(true)
      expect(Array.isArray(json.data.delivery_zones)).toBe(true)
      expect(json.data.delivery_zones.length).toBeGreaterThan(0)
    })

    it('POST /functions/v1/public-api/order-quotes calculates quote with signed token', async () => {
      const quotePayload = {
        order_type: 'delivery',
        delivery_zone_id: '40000000-0000-0000-0000-000000000001',
        items: [
          {
            menu_item_id: '10000000-0000-0000-0000-000000000001',
            quantity: 2,
          },
        ],
      }

      const res = await fetch(`${EDGE_BASE_URL}/functions/v1/public-api/order-quotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quotePayload),
      })

      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data).toBeDefined()
      expect(json.data.subtotal_vnd).toBeGreaterThan(0)
      expect(json.data.shipping_fee_vnd).toBeDefined()
      expect(json.data.total_vnd).toBe(json.data.subtotal_vnd + json.data.shipping_fee_vnd)
      expect(json.data.quote_token).toBeTruthy()
    })
  })

  describe('customer-api (Customer Gateway Auth Boundary)', () => {
    it('GET /functions/v1/customer-api/health without token is rejected with 401 AUTH_REQUIRED', async () => {
      const res = await fetch(`${EDGE_BASE_URL}/functions/v1/customer-api/health`)
      expect(res.status).toBe(401)

      const json = await res.json()
      expect(json.error).toBeDefined()
      expect(json.error.code).toBe('AUTH_REQUIRED')
      expect(json.request_id).toBeTruthy()
    })

    it('GET /functions/v1/customer-api/me without token is rejected with 401 AUTH_REQUIRED', async () => {
      const res = await fetch(`${EDGE_BASE_URL}/functions/v1/customer-api/me`)
      expect(res.status).toBe(401)

      const json = await res.json()
      expect(json.error).toBeDefined()
      expect(json.error.code).toBe('AUTH_REQUIRED')
    })
  })

  describe('admin-api (Admin Gateway Auth Boundary)', () => {
    it('GET /functions/v1/admin-api/health without token is rejected with 401 AUTH_REQUIRED', async () => {
      const res = await fetch(`${EDGE_BASE_URL}/functions/v1/admin-api/health`)
      expect(res.status).toBe(401)

      const json = await res.json()
      expect(json.error).toBeDefined()
      expect(json.error.code).toBe('AUTH_REQUIRED')
      expect(json.request_id).toBeTruthy()
    })

    it('GET /functions/v1/admin-api/dashboard without token is rejected with 401 AUTH_REQUIRED', async () => {
      const res = await fetch(`${EDGE_BASE_URL}/functions/v1/admin-api/dashboard`)
      expect(res.status).toBe(401)

      const json = await res.json()
      expect(json.error).toBeDefined()
      expect(json.error.code).toBe('AUTH_REQUIRED')
    })
  })
})
