import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, it, expect, vi } from 'vitest'
import { MemoryControls } from '@/features/account/MemoryControls'
const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }))
vi.mock('@/shared/lib/api/client', () => ({ customerApi: api }))
beforeEach(() => { vi.clearAllMocks(); api.get.mockResolvedValue({ data: { settings: { enabled: false }, facts: [] } }); api.put.mockResolvedValue({}); api.post.mockResolvedValue({}) })
it('does not optimistically enable memory and forget-all reflects server truth', async () => {
  render(<MemoryControls />)
  const checkbox = await screen.findByRole('checkbox')
  expect(checkbox).not.toBeChecked()
  fireEvent.click(checkbox)
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/me/ai-memory/settings', { enabled: true, consent_version: 1 }, expect.objectContaining({ signal: expect.any(AbortSignal) })))
  await waitFor(() => expect(checkbox).not.toBeDisabled())
  expect(checkbox).not.toBeChecked()
  fireEvent.click(screen.getByRole('button', { name: 'Quên tất cả' }))
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/me/ai-memory/forget', {}, expect.any(Object)))
})

it('only restores suppressed learning after an explicit customer action', async () => {
  const selector = { memory_type: 'preference', memory_key: 'bo' }
  api.get.mockResolvedValue({ data: { settings: { enabled: true }, facts: [], suppressions: [selector] } })
  render(<MemoryControls />)
  const restore = await screen.findByRole('button', { name: 'Cho phép học lại' })
  expect(api.post).not.toHaveBeenCalled()
  fireEvent.click(restore)
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/me/ai-memory/restore', selector, expect.any(Object)))
})
it('binds delete requests to the consent epoch displayed with the fact', async () => {
  const fact = { id: 'fact', memory_type: 'dislike', memory_key: 'hanh', source: 'explicit', value: { food: 'Hành' } }
  api.get.mockResolvedValue({ data: { settings: { enabled: true, memory_epoch: 7 }, facts: [fact] } })
  render(<MemoryControls />)
  fireEvent.click(await screen.findByRole('button', { name: 'Quên mục này' }))
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/me/ai-memory/delete', { memory_type: 'dislike', memory_key: 'hanh', source: 'explicit', expected_memory_epoch: 7 }, expect.any(Object)))
})
