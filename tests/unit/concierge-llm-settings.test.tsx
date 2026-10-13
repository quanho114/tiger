import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { ConciergeLlmSection } from '@/features/admin/settings/ConciergeLlmSection'

const api = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }))

vi.mock('@/shared/lib/supabase', () => ({ supabaseUrl: 'http://127.0.0.1:54321' }))
vi.mock('@/shared/lib/api/client', () => ({ adminApi: api }))

beforeEach(() => {
  api.get.mockReset()
  api.patch.mockReset()
  api.get.mockResolvedValue({ data: {
    provider: 'openai', base_url: 'http://localhost:20128/v1', model: 'test-model',
    enabled: false, has_key: false, api_key_masked: '', version: 1,
    configuration_valid: false, local_gateway_enabled: false,
  } })
})

it('does not suggest a private Docker gateway that the server rejects', async () => {
  render(<ConciergeLlmSection onNotify={vi.fn()} />)
  const input = await screen.findByRole('textbox', { name: /API URL \(base URL\)/ })
  expect(input).toHaveValue('http://localhost:20128/v1')

  expect(screen.queryByRole('button', { name: /Đổi thành/ })).not.toBeInTheDocument()
  expect(screen.getByText(/Gateway local cần được bật riêng trên server dev/)).toBeInTheDocument()
  expect(api.patch).not.toHaveBeenCalled()
})

it('does not claim a saved URL is active when the runtime rejects it', async () => {
  api.get.mockResolvedValueOnce({ data: { provider: 'openai', base_url: 'http://localhost:20128/v1',
    model: 'test-model', enabled: true, has_key: true, api_key_masked: '••••••••', version: 1,
    configuration_valid: false, local_gateway_enabled: false } })
  render(<ConciergeLlmSection onNotify={vi.fn()} />)
  expect(await screen.findByText('URL đã lưu không được server chấp nhận')).toBeInTheDocument()
  expect(screen.queryByText(/Đã lưu cấu hình AI chung/)).not.toBeInTheDocument()
})

it('explains that even an accepted pinned dev URL still needs a connection test', async () => {
  api.get.mockResolvedValueOnce({ data: { provider: 'openai', base_url: 'http://host.docker.internal:20128/v1',
    model: 'test-model', enabled: true, has_key: true, api_key_masked: '••••••••', version: 1,
    configuration_valid: true, local_gateway_enabled: true } })
  render(<ConciergeLlmSection onNotify={vi.fn()} />)
  expect(await screen.findByText(/Cấu hình hợp lệ, chưa xác minh kết nối/)).toBeInTheDocument()
  expect(screen.getByText(/Gateway local: chỉ đúng URL/)).toBeInTheDocument()
})

it('does not suggest Docker host for a remote API URL', async () => {
  render(<ConciergeLlmSection onNotify={vi.fn()} />)
  const input = await screen.findByRole('textbox', { name: /API URL \(base URL\)/ })
  fireEvent.change(input, { target: { value: 'https://api.example.com/v1' } })
  expect(screen.queryByRole('button', { name: /Đổi thành/ })).not.toBeInTheDocument()
})
