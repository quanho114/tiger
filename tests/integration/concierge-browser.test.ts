import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import pg from 'pg'
import { existsSync } from 'node:fs'
import { createServer, type ViteDevServer } from 'vite'
import { chromium, type Browser } from 'playwright-core'
import { expect as browserExpect } from '@playwright/test'
import { handlePublicApi } from '../../supabase/functions/public-api/index.ts'
import { createConciergeV2SessionStore } from '../../supabase/functions/_shared/concierge/session-store.ts'
import { setConciergeFeatureFlagsForTesting } from '../../supabase/functions/_shared/concierge/flags.ts'
import { ConciergeLlmOrchestrator } from '../../supabase/functions/_shared/concierge/llm.ts'
import { PostgresConciergeV2SessionBackend } from '../../supabase/functions/_shared/concierge/session-store-postgres.ts'
import { ensureConciergePostgresSessionTable } from '../fixtures/concierge-postgres.ts'
import { seedFixtureUsers, FIXTURE_USERS } from '../fixtures/auth-users.ts'
import { createConciergeHttpBridge } from '../fixtures/concierge-stream-http.ts'
describe('desktop and mobile browser with actual DB handler', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' })
  const backend = new PostgresConciergeV2SessionBackend(pool)
  const store = createConciergeV2SessionStore({ backend })
  const ids = new Set<string>()
  const rememberSessions = (body: string) => {
    const payloads = body.trim().startsWith('{') ? [JSON.parse(body)] : body.split('\n\n')
      .filter(block => block.startsWith('event:')).map(block => JSON.parse(block.slice(block.indexOf('data: ') + 6)))
    for (const payload of payloads) {
      const data = payload.stream_version === 2 ? payload.data : payload
      if (data.session) ids.add(data.session.session_id)
    }
  }
  let vite: ViteDevServer
  let browser: Browser
  let url: string
  const orchestrator = new ConciergeLlmOrchestrator({ customAdapter: async (message, _history, context) => {
    const bounded = context.bounded!
    if (bounded.exchanges.length) {
      const exchange = bounded.exchanges[0]
      const value = exchange.result as { status?: string; candidates?: unknown[] }
      const reply_text = value.status === 'unknown' || value.status === 'unavailable' || value.candidates?.length === 0
        ? 'Mình chưa tìm thấy món phù hợp trong thực đơn đã kiểm tra.'
        : 'Mình đã kiểm tra các lựa chọn trong thực đơn; bạn xem thẻ món bên dưới nhé.'
      return { reply_text, tool_calls: [], tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }
    }
    if (!bounded.tools.length) return { reply_text: 'Chào bạn, mình có thể giúp bạn chọn món.', tool_calls: [],
      tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }
    const tool = bounded.tools.some(value => value.name === 'recommend_meal') && /mâm|nhóm|\d+ người/i.test(message)
      ? 'recommend_meal' : 'search_menu_items'
    const arguments_ = tool === 'search_menu_items' ? { query: message, limit: 4 } : {}
    return { reply_text: '', tool_calls: [{ id: crypto.randomUUID(), name: tool, arguments: arguments_ }],
      tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }
  } })
  beforeAll(async () => {
    await ensureConciergePostgresSessionTable(pool)
    await seedFixtureUsers(pool)
    setConciergeFeatureFlagsForTesting({})
    vite = await createServer({ server: { host: '127.0.0.1', port: 5187, strictPort: false }, logLevel: 'error' })
    await vite.listen()
    url = vite.resolvedUrls!.local[0]
    browser = await chromium.launch({ executablePath: existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined, headless: true, args: ['--no-sandbox'] })
  }, 60000)
  it.each([1280, 390])('discards delayed replies on login, account switch and logout at %i px', async width => {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    const page = await context.newPage()
    let release: (() => void) | undefined
    let started = false
    await page.route('**/functions/v1/public-api/concierge/**', async route => {
      const incoming = route.request()
      const response = await handlePublicApi(new Request(incoming.url(), { method: 'POST', headers: { ...incoming.headers(), 'x-forwarded-for': '127.0.0.1' }, body: incoming.postData() }), { pool, conciergeSessionStore: store, orchestrator })
      const body = await response.text()
      rememberSessions(body)
      if (JSON.parse(incoming.postData()!).message) await new Promise<void>(resolve => { release = resolve; started = true })
      await route.fulfill({ status: response.status, contentType: response.headers.get('content-type') ?? 'application/json', body }).catch(() => {})
    })
    await page.goto(url)
    await page.getByRole('button', { name: 'Mở Tiger Concierge' }).click()
    const open = page.getByRole('button', { name: 'Nhắn với Tiger' })
    if (await open.count()) await open.click()
    for (const email of [FIXTURE_USERS.customerA.email, FIXTURE_USERS.customerB.email, null]) {
      started = false
      const message = `Gợi ý món ăn ${email ?? 'logout'}`
      await page.getByRole('textbox', { name: 'Tin nhắn cho trợ lý' }).fill(message)
      await page.getByRole('button', { name: 'Gửi tin nhắn' }).click()
      await browserExpect.poll(() => started).toBe(true)
      await page.evaluate(async email => {
        // Keep this browser import outside Vitest's server-side import transform.
        const { supabase } = await new Function('return import("/src/shared/lib/supabase.ts")')()
        const result = email ? await supabase.auth.signInWithPassword({ email, password: 'TestPassword123!' }) : await supabase.auth.signOut()
        if (result.error) throw new Error('Fixture authentication failed')
      }, email)
      release?.()
      await browserExpect(page.getByText(message, { exact: true })).toHaveCount(0)
      await browserExpect(page.getByRole('button', { name: 'Chọn vào giỏ nháp' })).toHaveCount(0)
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tiger_cart_draft_v1') ?? '{"items":[]}').items)).toEqual([])
    }
    await context.close()
  }, 60000)
  afterAll(async () => {
    await browser?.close(); await vite?.close()
    for (const id of ids) await backend.delete(id)
    setConciergeFeatureFlagsForTesting(null)
    await pool.end()
  })
  it.each([1280, 390])('receives real HTTP status before verified text and completes one bubble at %i px', async width => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const llm = new ConciergeLlmOrchestrator({ customAdapter: async message => {
      if (message === 'Xin chào') await gate
      return { reply_text: 'Chào bạn, mình có thể giúp chọn món. Bạn muốn dùng bữa mấy người?', tool_calls: [],
        tokens_used: { prompt_tokens: 10, completion_tokens: 12, total_tokens: 22 } }
    } })
    const bridge = await createConciergeHttpBridge({ pool, store, orchestrator: llm, onSession: id => ids.add(id) })
    const context = await browser.newContext({ viewport: { width, height: 844 } })
    const page = await context.newPage()
    try {
      await page.route('**/functions/v1/public-api/concierge/**', route => route.continue({
        url: bridge.url + new URL(route.request().url()).pathname,
      }))
      await page.goto(url)
      await page.getByRole('button', { name: 'Mở Tiger Concierge' }).click()
      await browserExpect(page.getByRole('button', { name: 'Gửi tin nhắn' })).toBeVisible()
      await page.getByRole('textbox', { name: 'Tin nhắn cho trợ lý' }).fill('Xin chào')
      await page.getByRole('button', { name: 'Gửi tin nhắn' }).click()
      await browserExpect(page.getByRole('button', { name: 'Dừng phản hồi' })).toBeVisible()
      const pending = page.locator('[data-message-id]').last()
      const bubbleId = await pending.getAttribute('data-message-id')
      await browserExpect(pending.getByRole('status')).toContainText('đang soạn')
      expect(await pending.textContent()).not.toContain('Bạn muốn dùng bữa')
      release()
      await browserExpect(page.getByRole('button', { name: 'Dừng phản hồi' })).toHaveCount(0)
      await browserExpect(pending).toContainText('Bạn muốn dùng bữa mấy người?')
      expect(await pending.getAttribute('data-message-id')).toBe(bubbleId)
      expect(await page.locator(`[data-message-id="${bubbleId}"]`).count()).toBe(1)
      expect(await page.getByText('Xin chào', { exact: true }).count()).toBe(1)
    } finally { release(); await context.close(); await bridge.close() }
  }, 30000)
  it.each([{ width: 1280, height: 900 }, { width: 390, height: 844 }])('retains same-page chat, builds/reviews/hands off and clears on reload at $width px', async viewport => {
    const context = await browser.newContext({ viewport })
    const item = (await pool.query('SELECT id, name, price_vnd FROM public.menu_items WHERE published AND available AND allow_delivery ORDER BY name LIMIT 1')).rows[0]
    await context.addInitScript(item => {
      if (!localStorage.getItem('tiger_cart_draft_v1')) localStorage.setItem('tiger_cart_draft_v1', JSON.stringify({ version: 1, updatedAt: Date.now(), context: { mode: 'delivery' },
        items: [{ dishId: item.id, quantity: 2, note: 'Ghi chú cũ', dishSnapshot: { id: item.id, name: item.name, price: item.price_vnd } }] }))
    }, item)
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/functions/v1/public-api/**', async route => {
      const incoming = route.request()
      const headers: Record<string, string> = { ...incoming.headers(), 'x-forwarded-for': '127.0.0.1' }
      delete headers.origin
      const request = new Request(incoming.url(), { method: incoming.method(), headers, body: incoming.postData() ?? undefined })
      const response = await handlePublicApi(request, { pool, conciergeSessionStore: store, orchestrator })
      const body = await response.text()
      rememberSessions(body)
      await route.fulfill({ status: response.status, headers: { 'content-type': response.headers.get('content-type') ?? 'application/json', 'access-control-allow-origin': '*' }, body })
    })
    await page.goto(url)
    const open = async () => {
      await page.getByRole('button', { name: 'Mở Tiger Concierge' }).click()
      const next = page.getByRole('button', { name: 'Nhắn với Tiger' })
      if (await next.count()) await next.click()
    }
    await open()
    const input = page.getByRole('textbox', { name: 'Tin nhắn cho trợ lý' })
    await input.fill(`Gợi ý ${item.name}`)
    await page.getByRole('button', { name: 'Gửi tin nhắn' }).click()
    await browserExpect(page.getByRole('button', { name: 'Chọn vào giỏ nháp' }).first()).toBeVisible({ timeout: 15000 })
    await page.getByTitle('Đóng cửa sổ').click()
    await open()
    await browserExpect(page.getByText(`Gợi ý ${item.name}`, { exact: true })).toBeVisible()
    await page.evaluate(() => { history.pushState({}, '', '/menu'); dispatchEvent(new PopStateEvent('popstate')) })
    await browserExpect(page.getByText(`Gợi ý ${item.name}`, { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Chọn vào giỏ nháp' }).first().click()
    await browserExpect(page.getByRole('button', { name: /Giỏ nháp/ })).toContainText('1 phần')
    await input.fill('chốt')
    await page.getByRole('button', { name: 'Gửi tin nhắn' }).click()
    await browserExpect(page.getByRole('button', { name: 'Chuyển vào giỏ hàng' })).toBeVisible()
    await browserExpect(page.getByRole('heading', { name: 'Món đã chọn' })).toBeFocused()
    await page.getByRole('button', { name: 'Chuyển vào giỏ hàng' }).focus()
    await page.keyboard.press('Enter')
    await browserExpect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('tiger_cart_draft_v1') ?? '{}').items?.length)).toBe(2)
    const merged = await page.evaluate(() => JSON.parse(localStorage.getItem('tiger_cart_draft_v1')!).items)
    expect(merged.map((line: { quantity: number }) => line.quantity)).toEqual([2, 1])
    expect(merged[0].note).toBe('Ghi chú cũ')
    const stored = await page.evaluate(() => localStorage.getItem('tiger_cart_draft_v1'))
    expect(stored).toContain('handoff_')
    expect(stored).not.toContain('csc_')
    expect(stored).not.toContain('Gợi ý')
    const leaks = await page.evaluate(() => [...Object.values(localStorage), ...Object.values(sessionStorage), location.href].some(value => value.includes('csc_') || value.includes('session_capability')))
    expect(leaks).toBe(false)
    const otherTab = await context.newPage()
    await otherTab.goto(url)
    await otherTab.getByRole('button', { name: 'Mở Tiger Concierge' }).click()
    const otherOpen = otherTab.getByRole('button', { name: 'Nhắn với Tiger' })
    if (await otherOpen.count()) await otherOpen.click()
    await browserExpect(otherTab.getByRole('textbox', { name: 'Tin nhắn cho trợ lý' })).toBeVisible()
    expect(await otherTab.getByText(`Gợi ý ${item.name}`, { exact: true }).count()).toBe(0)
    await otherTab.close()
    await page.clock.setFixedTime(new Date(Date.now() + 46 * 60_000))
    await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow')))
    await browserExpect(page.getByText('Phiên trò chuyện đã kết thúc. Bạn có thể bắt đầu lại.')).toBeVisible()
    expect(await page.getByText(`Gợi ý ${item.name}`, { exact: true }).count()).toBe(0)
    await page.reload()
    await open()
    await browserExpect(page.getByRole('textbox', { name: 'Tin nhắn cho trợ lý' })).toBeVisible()
    expect(await page.getByRole('button', { name: /Giỏ nháp/ }).count()).toBe(0)
    expect(await page.getByText(`Gợi ý ${item.name}`, { exact: true }).count()).toBe(0)
    expect(errors).toEqual([])
    await context.close()
  }, 60000)
})
