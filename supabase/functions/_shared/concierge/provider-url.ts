import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { allowsLocalDefaults, readEnv } from '../environment.ts'

const DEFAULT_HOSTS = ['api.openai.com']

export function localProviderBaseUrl(): string | null {
  if (!allowsLocalDefaults()) return null
  const value = readEnv('CONCIERGE_LLM_DEV_BASE_URL')
  if (!value || value.length > 500 || [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' || !['host.docker.internal', '127.0.0.1', '[::1]'].includes(url.hostname) ||
        !url.port || url.username || url.password || url.search || url.hash || url.pathname !== '/v1') return null
    return url.href.replace(/\/+$/, '')
  } catch { return null }
}

function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [first, second] = address.split('.').map(Number)
    return first !== 0 && first !== 10 && first !== 127 && first < 224 &&
      !(first === 100 && second >= 64 && second <= 127) &&
      !(first === 169 && second === 254) &&
      !(first === 172 && second >= 16 && second <= 31) &&
      !(first === 192 && (second === 168 || second === 0)) &&
      !(first === 198 && (second === 18 || second === 19))
  }
  if (isIP(address) !== 6) return false
  const normalized = address.toLowerCase()
  return /^[23][0-9a-f]{0,3}:/.test(normalized) &&
    !normalized.startsWith('2001:db8:') && !normalized.includes('%')
}

export function validateProviderBaseUrl(value: string, allowedHosts = readEnv('CONCIERGE_LLM_ALLOWED_HOSTS') ?? ''): string {
  if (!value.trim()) return ''
  if (value.length > 500 || [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127))
    throw new Error('INVALID_PROVIDER_URL')
  let url: URL
  try { url = new URL(value) }
  catch { throw new Error('INVALID_PROVIDER_URL') }
  const localBase = localProviderBaseUrl()
  if (localBase && url.href.replace(/\/+$/, '') === localBase) return localBase
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  const hosts = [...DEFAULT_HOSTS, ...allowedHosts.split(',').map(host => host.trim().toLowerCase())]
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      !/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(hostname) ||
      !hosts.includes(hostname)) throw new Error('INVALID_PROVIDER_URL')
  return url.href.replace(/\/+$/, '')
}

export async function assertPublicProviderDestination(
  endpoint: string,
  resolve: (hostname: string) => Promise<string[]> = async hostname =>
    (await lookup(hostname, { all: true })).map(result => result.address),
): Promise<void> {
  const localBase = localProviderBaseUrl()
  if (localBase && endpoint === `${localBase}/chat/completions`) return
  const hostname = new URL(endpoint).hostname
  try {
    const addresses = await resolve(hostname)
    if (!addresses.length || !addresses.every(isPublicAddress)) throw new Error('UNSAFE_PROVIDER_DESTINATION')
  } catch {
    throw new Error('UNSAFE_PROVIDER_DESTINATION')
  }
}
