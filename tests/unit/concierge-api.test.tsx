import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { sendConciergeAction, prepareConciergeClaim, claimConciergeSession, sendConciergeTurn,
  clearConciergeStreamRecovery } from '@/features/concierge/api'
import { useConcierge } from '@/features/concierge/useConcierge'
import { ConciergeV2TurnRequestSchema } from '@contracts/concierge-v2'

const cart = vi.hoisted(() => ({ add: vi.fn(), applyHandoff: vi.fn(), setCartOpen: vi.fn() }))
const authState = vi.hoisted(() => ({ listener: null as null | ((event: string, session: { user: { id: string } } | null) => void) }))
vi.mock('@/features/cart', () => ({ useCart: () => cart }))
vi.mock('@/shared/lib/supabase', () => ({
  supabaseUrl: 'http://localhost:54321',
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: (listener: typeof authState.listener) => {
        authState.listener = listener
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      },
    },
  },
}))

const session = {
  session_id: '11111111-1111-4111-8111-111111111111',
  session_capability: `csc_${'a'.repeat(32)}`,
  state_version: 2,
  idle_expires_at: new Date(Date.now() + 3600000).toISOString(),
  absolute_expires_at: new Date(Date.now() + 7200000).toISOString(),
}
const addition = {
  proposal_id: 'proposal-1',
  items: [
    {
      menu_item_id: '22222222-2222-4222-8222-222222222222',
      item_name: 'Món thử',
      quantity: 3,
      note: 'Ít cay',
      unit_price_vnd: 120000,
    },
  ],
}
const handoff = {
  handoff_id: 'handoff_abcdefghijklmnop', draft_id: session.session_id, draft_version: 3,
  expires_at: new Date(Date.now() + 60000).toISOString(), replay: false,
  lines: [{ menu_item_id: addition.items[0].menu_item_id, name: 'Món thử', quantity: 3, note: 'Ít cay', price_vnd: 120000,
    availability: 'available', price_status: 'current', allergy_status: 'verified_safe' }],
}
const handoffAction = { type: 'handoff_draft' as const, draft_id: session.session_id, draft_version: 3, order_mode: 'delivery' as const }
const reply = (extra = {}) => ({
  protocol_version: 'concierge-v2',
  request_id: crypto.randomUUID(),
  response_id: crypto.randomUUID(),
  session,
  phase: 'RECOMMENDATION',
  message: 'Đã xử lý',
  cards: [],
  warnings: [],
  ...extra,
})
const reference = {
  conversation_id: session.session_id,
  session_token: session.session_capability,
  state_version: 2,
}
let transport: ReturnType<typeof vi.fn>
const respond = (extra = {}) => async (_url: string, options: RequestInit) => {
  const payload = ConciergeV2TurnRequestSchema.parse(JSON.parse(options.body as string))
  return new Response(JSON.stringify(reply({ ...extra, request_id: payload.request_id })))
}
beforeEach(() => {
  vi.clearAllMocks()
  clearConciergeStreamRecovery()
  authState.listener = null
  localStorage.clear()
  transport = vi.fn(respond({ handoff }))
  vi.stubGlobal('fetch', transport)
})
afterEach(() => vi.unstubAllGlobals())

it('sends a suggested follow-up and a third input with the latest canonical version', async () => {
  let version = 1
  transport.mockImplementation(async (_url: string, options: RequestInit) => {
    const payload = ConciergeV2TurnRequestSchema.parse(JSON.parse(options.body as string))
    if (version > 1) expect(payload.expected_state_version).toBe(version)
    version++
    return new Response(JSON.stringify(reply({ request_id: payload.request_id, session: { ...session, state_version: version },
      message: 'Bạn xem lựa chọn trong thẻ nhé.', suggested_actions: ['Gợi ý món không cay'] })))
  })
  const { result } = renderHook(() => useConcierge())
  await act(async () => { await result.current.sendMessage('Cho xem menu') })
  expect(result.current.suggestedActions).toEqual(['Gợi ý món không cay'])
  await act(async () => { await result.current.sendMessage(result.current.suggestedActions[0]) })
  expect(result.current.isLoading).toBe(false)
  await act(async () => { await result.current.sendMessage('Cho xem món khác') })
  expect(result.current.isLoading).toBe(false)
  expect(result.current.stateVersion).toBe(4)
  expect(transport).toHaveBeenCalledTimes(3)
  expect(cart.applyHandoff).not.toHaveBeenCalled()
})

it('sends the draft handoff through the real client and preserves authoritative cart lines', async () => {
  const result = await sendConciergeAction({
    ...reference,
    action: handoffAction,
  })
  expect(transport.mock.calls[0][0]).toContain('/concierge/action')
  expect(JSON.parse(transport.mock.calls[0][1].body)).toMatchObject({
    expected_state_version: 2,
    session: { session_id: session.session_id },
    action: handoffAction,
  })
  expect(result.handoff).toEqual(handoff)
})

it('stores only a short-lived claim ticket across login and removes it after claim', async () => {
  const ticket = `cct_${'b'.repeat(64)}`
  transport.mockImplementation(async (url: string) => new Response(JSON.stringify(url.endsWith('/prepare-claim')
    ? { ticket }
    : { session: { ...session, session_capability: `csc_${'c'.repeat(64)}` },
        transcript: [{ role: 'user', content: '4 người nha' }], draft: null })))
  await prepareConciergeClaim({ session_id: session.session_id, session_capability: session.session_capability })
  expect(Array.from({ length: localStorage.length }, (_, index) => localStorage.getItem(localStorage.key(index)!)).join(''))
    .not.toContain(session.session_capability)
  expect((await claimConciergeSession())?.transcript).toEqual([{ role: 'user', content: '4 người nha' }])
  expect(localStorage.length).toBe(0)
})

it('keeps the active guest conversation when the same browser signs in', async () => {
  const ticket = `cct_${'d'.repeat(64)}`
  const rotated = `csc_${'e'.repeat(64)}`
  transport.mockImplementation(async (url: string, options: RequestInit) => {
    if (url.endsWith('/prepare-claim')) return new Response(JSON.stringify({ ticket }))
    if (url.endsWith('/claim')) return new Response(JSON.stringify({ session: { ...session, state_version: 3,
      session_capability: rotated }, transcript: [{ role: 'user', content: '4 người nha' },
        { role: 'assistant', content: 'Đã xử lý' }], draft: null }))
    return respond()(url, options)
  })
  const { result } = renderHook(() => useConcierge())
  await act(async () => { await result.current.sendMessage('4 người nha') })
  await act(async () => { await result.current.prepareLoginTransition() })
  act(() => { authState.listener?.('SIGNED_IN', { user: { id: crypto.randomUUID() } }) })
  await waitFor(() => expect(result.current.sessionToken).toBe(rotated))
  expect(result.current.messages.map(message => message.text)).toEqual(['4 người nha', 'Đã xử lý'])
  expect(result.current.stateVersion).toBe(3)
})

it.each([
  ['guests', '4'],
  ['appetite', 'heavy'],
] as const)('accepts typed %s clarification at the actual API boundary', async (field, value) => {
  await sendConciergeAction({
    ...reference,
    action: {
      type: 'answer_clarification',
      choice_field: field,
      choice_value: value,
    },
  })
  expect(transport).toHaveBeenCalledTimes(1)
})

it('forwards the same handoff ID and exact lines to the atomic cart merge on replay', async () => {
  const { result } = renderHook(() => useConcierge())
  transport.mockImplementationOnce(respond())
  await act(async () => {
    await result.current.sendMessage('Gợi ý món')
  })
  await act(async () => {
    await result.current.sendAction(handoffAction)
  })
  await act(async () => {
    await result.current.sendAction(handoffAction)
  })
  expect(cart.add).not.toHaveBeenCalled()
  expect(cart.applyHandoff).toHaveBeenCalledTimes(2)
  expect(cart.applyHandoff).toHaveBeenNthCalledWith(1, handoff)
  expect(cart.applyHandoff).toHaveBeenNthCalledWith(2, handoff)
})

it('serializes feedback with other session mutations', async () => {
  const { result } = renderHook(() => useConcierge())
  transport.mockImplementationOnce(respond())
  await act(async () => {
    await result.current.sendMessage('Gợi ý món')
  })
  let resolve!: (response: Response) => void
  transport.mockImplementationOnce(
    () =>
      new Promise<Response>((yes) => {
        resolve = yes
      })
  )
  let pending!: Promise<void>
  act(() => {
    pending = result.current.sendMessage('Thông tin thêm')
  })
  await act(async () => {
    await expect(
      result.current.submitFeedback({ proposal_id: 'proposal-1', rating: 'perfect' })
    ).rejects.toThrow('đang xử lý')
  })
  expect(transport).toHaveBeenCalledTimes(2)
  await act(async () => {
    resolve(new Response(JSON.stringify(reply({ request_id: JSON.parse(transport.mock.calls[1][1].body).request_id }))))
    await pending
  })
})

it('reuses the action request ID after a lost response so the server can replay the committed result', async () => {
  const { result } = renderHook(() => useConcierge())
  transport.mockImplementationOnce(respond())
  await act(async () => {
    await result.current.sendMessage('Gợi ý món')
  })
  transport.mockRejectedValueOnce(new TypeError('Network response lost'))
  await act(async () => {
    await expect(result.current.sendAction(handoffAction)).resolves.toBe(false)
  })
  expect(cart.add).not.toHaveBeenCalled()
  await act(async () => {
    await result.current.sendAction(handoffAction)
  })
  const original = JSON.parse(transport.mock.calls[1][1].body)
  const retry = JSON.parse(transport.mock.calls[2][1].body)
  expect(retry).toEqual(original)
  expect(cart.applyHandoff).toHaveBeenCalledWith(handoff)
})

it('retains the user message and reuses one assistant bubble when retrying', async () => {
  const { result } = renderHook(() => useConcierge())
  await act(async () => { await result.current.sendMessage('Chào bạn') })
  transport.mockRejectedValueOnce(new TypeError('Network response lost'))
  await act(async () => { await result.current.sendMessage('Gợi ý món') })
  expect(result.current.messages.map(message => message.text)).toEqual(['Chào bạn', 'Đã xử lý', 'Gợi ý món', ''])
  expect(result.current.messages.at(-1)?.delivery).toBe('interrupted')
  const bubbleId = result.current.messages.at(-1)?.id
  expect(result.current.retryText).toBe('Gợi ý món')
  await act(async () => { await result.current.sendMessage(result.current.retryText) })
  expect(result.current.messages.map(message => message.text)).toEqual(['Chào bạn', 'Đã xử lý', 'Gợi ý món', 'Đã xử lý'])
  expect(result.current.retryText).toBe('')
  expect(result.current.messages.at(-1)?.id).toBe(bubbleId)
  expect(JSON.parse(transport.mock.calls[2][1].body).request_id)
    .toBe(JSON.parse(transport.mock.calls[1][1].body).request_id)
})

it('freezes first-turn context and recovers its receipt after a disconnected stream', async () => {
  const requestId = crypto.randomUUID()
  const reference = { session_id: session.session_id, session_capability: session.session_capability }
  const streamId = crypto.randomUUID()
  const receipt = `event: start\ndata: ${JSON.stringify({ stream_version: 2, stream_id: streamId, seq: 1,
    request_id: requestId, type: 'start', data: { session: reference } })}\n\n`
  transport.mockResolvedValueOnce(new Response(receipt, { headers: { 'Content-Type': 'text/event-stream' } }))
  const body = { protocol_version: 'concierge-v2' as const, request_id: requestId, message: 'Xin chào', page_context: { page: 'home' as const } }
  await expect(sendConciergeTurn(body, undefined, vi.fn())).rejects.toMatchObject({ code: 'STREAM_INTERRUPTED' })
  await sendConciergeTurn({ ...body, page_context: { page: 'menu' } }, undefined, vi.fn())
  const retry = JSON.parse(transport.mock.calls[1][1].body)
  expect(retry).toMatchObject({ request_id: requestId, page_context: { page: 'home' }, resume_session: reference })
  expect(retry.session).toBeUndefined()
  expect(localStorage.length).toBe(0)
})

it('stops reception and reconciles a committed response without reexecuting a mutation', async () => {
  const { result } = renderHook(() => useConcierge())
  transport.mockImplementationOnce(respond())
  await act(async () => { await result.current.sendMessage('Xin chào') })
  transport.mockImplementationOnce(async (_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
    options.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
  }))
  let pending!: Promise<boolean>
  act(() => { pending = result.current.sendAction(handoffAction) })
  await waitFor(() => expect(transport).toHaveBeenCalledTimes(2))
  act(() => result.current.stopResponse())
  await act(async () => { await pending })
  expect(JSON.parse(transport.mock.calls[2][1].body)).toMatchObject({ recover_only: true, action: handoffAction })
  expect(cart.applyHandoff).toHaveBeenCalledOnce()
  expect(result.current.isLoading).toBe(false)
  expect(result.current.hasPendingAction).toBe(false)
})

it('does not block deterministic menu turns after an opening greeting provider failure', async () => {
  const { result } = renderHook(() => useConcierge())
  transport.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Trợ lý chưa phản hồi.' } }), { status: 503 }))
  await act(async () => { await result.current.openConversation() })
  expect(result.current.hasPendingAction).toBe(false)
  await act(async () => { await result.current.sendMessage('Xem món ăn') })
  expect(transport).toHaveBeenCalledTimes(2)
  expect(result.current.messages.at(-1)?.delivery).toBe('complete')
})

it.each(['logout', 'account_switch'])('discards an old account response after %s while a request is in flight', async transition => {
  const { result } = renderHook(() => useConcierge())
  act(() => { authState.listener?.('SIGNED_IN', { user: { id: 'account-a' } }) })
  await act(async () => { await result.current.sendMessage('Xin chào') })
  let release!: (response: Response) => void
  transport.mockImplementationOnce(() => new Promise<Response>(resolve => { release = resolve }))
  let pending!: Promise<void>
  act(() => { pending = result.current.sendMessage('Tư vấn bữa hiện tại') })
  await waitFor(() => expect(transport).toHaveBeenCalledTimes(2))
  act(() => { authState.listener?.(transition === 'logout' ? 'SIGNED_OUT' : 'SIGNED_IN',
    transition === 'logout' ? null : { user: { id: 'account-b' } }) })
  await act(async () => {
    const request = JSON.parse(transport.mock.calls[1][1].body)
    release(new Response(JSON.stringify(reply({ request_id: request.request_id, message: 'Thông tin riêng tài khoản cũ' }))))
    await pending
  })
  expect(result.current.messages).toEqual([])
  expect(result.current.sessionToken).toBeNull()
  expect(result.current.draft).toBeNull()
  expect(result.current.isLoading).toBe(false)
})
