import { useState, useEffect, useCallback, useRef, type FC, type FormEvent } from 'react'
import {
  Bot,
  KeyRound,
  Link2,
  Cpu,
  Power,
  Save,
  FlaskConical,
  Eye,
  EyeOff,
  CheckCircle2,
} from 'lucide-react'
import { adminApi } from '../../../lib/api/client'
import { ApiError } from '../../../lib/api/types'
import { AdminLoading } from '../components/AdminLoading'

interface ConciergeLlmSectionProps {
  onNotify: (text: string, type: 'success' | 'error') => void
}

interface LlmConfig {
  provider: string
  base_url: string
  model: string
  enabled: boolean
  version: number
  has_key: boolean
  api_key_masked: string
}

const PROVIDERS = [
  { id: 'openai', label: 'OpenAI (hoặc cổng tương thích)' },
  { id: 'anthropic', label: 'Anthropic Claude' },
  { id: 'gemini', label: 'Google Gemini' },
  { id: 'stub', label: 'Tắt AI (chế độ mẫu)' },
]

const MODEL_HINTS: Record<string, string> = {
  openai: 'VD: gpt-4o-mini',
  anthropic: 'VD: claude-3-5-sonnet-latest',
  gemini: 'VD: gemini-1.5-flash',
}

export const ConciergeLlmSection: FC<ConciergeLlmSectionProps> = ({ onNotify }) => {
  const [config, setConfig] = useState<LlmConfig | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)

  const [provider, setProvider] = useState<string>('openai')
  const [baseUrl, setBaseUrl] = useState<string>('')
  const [apiKey, setApiKey] = useState<string>('')
  const [model, setModel] = useState<string>('')
  const [enabled, setEnabled] = useState<boolean>(false)
  const [showKey, setShowKey] = useState<boolean>(false)

  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [isTesting, setIsTesting] = useState<boolean>(false)
  const [testResult, setTestResult] = useState<string | null>(null)

  // Parent re-renders often (new onNotify identity each time). These refs
  // break that chain so the form is populated once and never reset
  // while admin is typing.
  const notifyRef = useRef(onNotify)
  useEffect(() => {
    notifyRef.current = onNotify
  })
  const formInitializedRef = useRef<boolean>(false)

  const loadConfig = useCallback(async () => {
    try {
      if (!formInitializedRef.current) setIsLoading(true)
      const res = await adminApi.get<LlmConfig>('/llm-config')
      const cfg = res.data
      setConfig(cfg)
      if (!formInitializedRef.current) {
        setProvider(cfg.provider || 'openai')
        setBaseUrl(cfg.base_url || '')
        setModel(cfg.model || '')
        setEnabled(cfg.enabled)
        setApiKey('')
        setTestResult(null)
        formInitializedRef.current = true
      }
    } catch (err: unknown) {
      notifyRef.current(err instanceof Error ? err.message : 'Không thể tải cấu hình chatbot', 'error')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadConfig()
  }, [loadConfig])

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    if (!config) return
    setIsSaving(true)
    try {
      const payload: Record<string, unknown> = {
        expected_version: config.version,
        provider,
        base_url: baseUrl.trim(),
        model: model.trim(),
        enabled,
      }
      // Only send a key when admin typed a new one; empty keeps the stored secret.
      if (apiKey.trim() !== '') {
        payload.api_key = apiKey.trim()
      }
      const res = await adminApi.patch<LlmConfig>('/llm-config', payload)
      const cfg = res.data
      setConfig(cfg)
      setProvider(cfg.provider)
      setBaseUrl(cfg.base_url || '')
      setModel(cfg.model || '')
      setEnabled(cfg.enabled)
      setApiKey('')
      onNotify('Đã lưu cấu hình chatbot. Toàn bộ user sẽ dùng backend mới.', 'success')
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        onNotify('Cấu hình vừa bị người khác sửa. Đang tải lại bản mới nhất...', 'error')
        void loadConfig()
      } else {
        onNotify(err instanceof Error ? err.message : 'Không thể lưu cấu hình chatbot', 'error')
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleTest = async () => {
    setIsTesting(true)
    setTestResult(null)
    try {
      const payload: Record<string, unknown> = { provider, model: model.trim() }
      if (baseUrl.trim() !== '') payload.base_url = baseUrl.trim()
      if (apiKey.trim() !== '') payload.api_key = apiKey.trim()
      const res = await adminApi.post<{ ok: boolean; provider: string; model: string; latency_ms: number }>(
        '/llm-config/test',
        payload
      )
      setTestResult(`Kết nối OK (${res.data.provider}/${res.data.model}, ${res.data.latency_ms}ms)`)
    } catch (err: unknown) {
      onNotify(err instanceof Error ? err.message : 'Kiểm tra kết nối thất bại', 'error')
    } finally {
      setIsTesting(false)
    }
  }

  if (isLoading) {
    return <AdminLoading label="Đang tải cấu hình chatbot..." />
  }

  return (
    <form onSubmit={handleSave} className="space-y-5">
      {/* Status banner */}
      <div
        className={`rounded-2xl border p-4 flex items-center gap-3 shadow-2xs ${
          enabled && provider !== 'stub' && (config?.has_key || apiKey.trim() !== '')
            ? 'bg-emerald-50/70 border-emerald-200'
            : 'bg-slate-50 border-slate-200'
        }`}
      >
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
            enabled && provider !== 'stub' ? 'bg-emerald-600 text-white' : 'bg-slate-300 text-white'
          }`}
        >
          <Bot className="w-4.5 h-4.5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-bold text-slate-900">
            {enabled && provider !== 'stub'
              ? `Chatbot đang dùng AI chung (${provider})`
              : 'Chatbot đang ở chế độ mẫu (không gọi AI)'}
          </div>
          <div className="text-[11px] text-slate-600">
            Mọi khách trên hệ thống dùng chung cấu hình này. Key lưu ở server, không bao giờ lộ ra browser.
          </div>
        </div>
        <button
          type="button"
          onClick={() => setEnabled((v) => !v)}
          className={`ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 cursor-pointer ${
            enabled
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Power className="w-3.5 h-3.5" />
          <span>{enabled ? 'Đang bật' : 'Đang tắt'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Provider */}
        <label className="block">
          <span className="block text-xs font-semibold text-slate-700 mb-1.5">Nhà cung cấp AI</span>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        {/* Model */}
        <label className="block">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5">
            <Cpu className="w-3.5 h-3.5 text-slate-400" />
            <span>Model</span>
          </span>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={MODEL_HINTS[provider] || 'Tên model'}
            className="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder:text-slate-400"
          />
        </label>
      </div>

      {/* Base URL */}
      <label className="block">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5">
          <Link2 className="w-3.5 h-3.5 text-slate-400" />
          <span>API URL (base URL)</span>
        </span>
        <input
          type="url"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="Để trống = dùng mặc định của hãng. VD cổng OpenAI: https://api.9router.ai/v1"
          className="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder:text-slate-400"
        />
        <span className="block text-[11px] text-slate-500 mt-1">
          Dùng khi đi qua cổng trung gian (VD: 9Router) hoặc model server nội bộ chuẩn OpenAI.
        </span>
      </label>

      {/* API Key */}
      <div>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5">
          <KeyRound className="w-3.5 h-3.5 text-slate-400" />
          <span>API Key</span>
          {config?.has_key && (
            <span className="ml-1 px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 font-mono text-[10px]">
              {config.api_key_masked || 'đã lưu'}
            </span>
          )}
        </span>
        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={config?.has_key ? 'Để trống để giữ key cũ, nhập để thay key mới' : 'Dán API key vào đây'}
            autoComplete="off"
            className="w-full pl-3 pr-10 py-2.5 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1"
            aria-label={showKey ? 'Ẩn key' : 'Hiện key'}
          >
            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Test result */}
      {testResult && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-medium">{testResult}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
        <button
          type="button"
          onClick={handleTest}
          disabled={isTesting || isSaving}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition disabled:opacity-50 cursor-pointer"
        >
          <FlaskConical className={`w-3.5 h-3.5 ${isTesting ? 'animate-pulse' : ''}`} />
          <span>{isTesting ? 'Đang kiểm tra...' : 'Kiểm tra kết nối'}</span>
        </button>
        <button
          type="submit"
          disabled={isSaving || isTesting}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-2xs transition disabled:opacity-50 cursor-pointer"
        >
          <Save className="w-3.5 h-3.5" />
          <span>{isSaving ? 'Đang lưu...' : 'Lưu & áp dụng cho toàn hệ thống'}</span>
        </button>
      </div>
    </form>
  )
}
