import { randomId } from './randomId'
import type { AuthTokens, GuestSession, GuestOrderSession, User } from '../types/api'

type Session = { accessToken: string; refreshToken?: string; user: User }
const key = 'xiro.api-session.v1'
let session: Session | null = readSession()
let refreshing: Promise<void> | null = null
function readSession(): Session | null { try { const value = JSON.parse(sessionStorage.getItem(key) || 'null'); return value?.accessToken && value.user ? value : null } catch { return null } }
export function currentUser() { return session?.user || null }
export function setSession(value: AuthTokens | GuestSession | GuestOrderSession | null) {
  session = !value ? null : 'accessToken' in value ? { accessToken: value.accessToken, refreshToken: value.refreshToken, user: value.user } : { accessToken: value.guestToken, user: value.guestUser }
  try { if (session) sessionStorage.setItem(key, JSON.stringify(session)); else sessionStorage.removeItem(key) } catch { /* In-memory session remains usable. */ }
}
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details: Record<string, unknown> = {}) { super(message) }
}
type RequestOptions = { method?: string; body?: unknown; version?: number; key?: string; signal?: AbortSignal; expectJson?: boolean }
async function readResponse<T>(response: Response, expectJson = false): Promise<T> {
  if (response.status === 204) {
    if (expectJson) throw new ApiError(204, 'EMPTY_RESPONSE', '서버가 필요한 데이터를 보내지 않았어요. 다시 시도해 주세요.')
    return undefined as T
  }
  const body = await response.text()
  if (!body.trim()) throw new ApiError(response.status, 'EMPTY_RESPONSE', `서버 응답이 비어 있어요 (HTTP ${response.status}). 서버 연결을 확인하고 다시 시도해 주세요.`)
  let value: unknown
  try { value = JSON.parse(body) }
  catch { throw new ApiError(response.status, 'INVALID_RESPONSE', `서버 응답을 읽을 수 없어요 (HTTP ${response.status}). 서버 연결을 확인하고 다시 시도해 주세요.`) }
  if (!response.ok) {
    const error = value && typeof value === 'object' && 'error' in value ? value.error : null
    const details = error && typeof error === 'object' ? error as { code?: string; message?: string; details?: Record<string, unknown> } : null
    throw new ApiError(response.status, details?.code || 'REQUEST_FAILED', details?.message || '요청에 실패했어요.', details?.details)
  }
  if (expectJson && (!value || typeof value !== 'object')) throw new ApiError(response.status, 'INVALID_RESPONSE', '서버가 필요한 데이터를 보내지 않았어요. 다시 시도해 주세요.')
  return value as T
}
function requireTokens(value: AuthTokens): AuthTokens {
  if (typeof value?.accessToken !== 'string' || typeof value?.refreshToken !== 'string' || !value.user || typeof value.user.id !== 'string')
    throw new ApiError(200, 'INVALID_RESPONSE', '로그인 응답이 올바르지 않아요. 다시 시도해 주세요.')
  return value
}
async function refresh() {
  if (!session?.refreshToken) throw new ApiError(401, 'TOKEN_EXPIRED', '다시 로그인해 주세요.')
  if (!refreshing) refreshing = (async () => {
    const response = await fetch('/api/v1/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: session!.refreshToken }) })
    const tokens = requireTokens(await readResponse<AuthTokens>(response, true))
    setSession(tokens)
  })().finally(() => { refreshing = null })
  await refreshing
}
function headers(options: RequestOptions) {
  const value: Record<string, string> = {}
  if (session) value.Authorization = `Bearer ${session.accessToken}`
  if (options.body !== undefined) value['Content-Type'] = 'application/json'
  if (options.version !== undefined) value['If-Match'] = `"${options.version}"`
  if (options.method && options.method !== 'GET') value['Idempotency-Key'] = options.key || randomId()
  return value
}
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  // Retain the same idempotency key on refresh/retry. A version conflict is shown
  // to the user and never silently reapplies a state-changing action.
  const stableOptions = { ...options, key: options.key || randomId() }
  const request = () => fetch(`/api${path.startsWith('/dev/') || path === '/health' ? '' : '/v1'}${path}`, { method: options.method || 'GET', headers: headers(stableOptions), body: options.body === undefined ? undefined : JSON.stringify(options.body), signal: options.signal })
  let response: Response
  try { response = await request(); if (response.status === 401 && session?.refreshToken) { await refresh(); response = await request() } }
  catch (e) { if (e instanceof ApiError || e instanceof DOMException && e.name === 'AbortError') throw e; throw new ApiError(0, 'NETWORK_ERROR', '연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.') }
  return readResponse<T>(response, options.expectJson)
}
export async function allPages<T>(path: string): Promise<T[]> {
  const items: T[] = []; let cursor: string | null = null
  do {
    const page: { items: T[]; nextCursor: string | null } = await api(`${path}${path.includes('?') ? '&' : '?'}limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { expectJson: true })
    items.push(...page.items); cursor = page.nextCursor
  } while (cursor)
  return items
}
export async function demoLogin(displayName: string, merchant = false) {
  const redirectUri = `${window.location.origin}/`
  const { authorizationCode } = await api<{ authorizationCode: string }>('/dev/login-codes', { method: 'POST', body: { displayName, merchant, redirectUri }, expectJson: true })
  const tokens = requireTokens(await api<AuthTokens>('/auth/login', { method: 'POST', body: { provider: 'demo', authorizationCode, redirectUri }, expectJson: true })); setSession(tokens); return tokens.user
}
export async function localLogin(email: string, password: string) {
  const redirectUri = `${window.location.origin}/`
  const { authorizationCode } = await api<{ authorizationCode: string }>('/auth/local-codes', { method: 'POST', body: { email, password, redirectUri }, expectJson: true })
  const tokens = requireTokens(await api<AuthTokens>('/auth/login', { method: 'POST', body: { provider: 'local', authorizationCode, redirectUri }, expectJson: true })); setSession(tokens); return tokens.user
}
export async function logout() {
  try { if (session?.refreshToken) await api('/auth/logout', { method: 'POST', body: { refreshToken: session.refreshToken } }) }
  catch (e) { if (!(e instanceof ApiError) || e.status !== 401) throw e }
  finally { setSession(null) }
}
export type StreamEvent = { eventId: string; type: string; data: Record<string, unknown> }
export function subscribe(path: string, onEvent: (event: StreamEvent) => void, onConnect: () => void, onStatus: (connected: boolean) => void) {
  const controller = new AbortController(), seen = new Set<string>(); let cursor = '', retry = 400
  const run = async () => {
    while (!controller.signal.aborted) {
      try {
        let response = await fetch(`/api/v1${path}/events`, { headers: { ...headers({}), Accept: 'text/event-stream', ...(cursor ? { 'Last-Event-ID': cursor } : {}) }, signal: controller.signal })
        if (response.status === 401 && session?.refreshToken) { await refresh(); continue }
        if (response.status === 409) { cursor = ''; continue }
        if (response.status === 401 || response.status === 404) { onStatus(false); return }
        if (!response.ok || !response.body) throw new Error('Stream unavailable')
        onStatus(true); onConnect(); retry = 400
        const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = ''
        try {
          while (!controller.signal.aborted) {
            const { done, value } = await reader.read(); if (done) break
            buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
            let end: number
            while ((end = buffer.indexOf('\n\n')) >= 0) {
              const block = buffer.slice(0, end); buffer = buffer.slice(end + 2)
              const lines = block.split('\n'), data = lines.filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n'), eventId = lines.find(l => l.startsWith('id:'))?.slice(3).trim()
              if (data) {
                const event = JSON.parse(data) as StreamEvent
                if (!eventId || !seen.has(eventId)) { onEvent(event); if (eventId) { seen.add(eventId); if (seen.size > 500) seen.delete(seen.values().next().value!) } }
                if (lines.some(line => line === 'event: session.expired')) { onStatus(false); return }
              }
              if (eventId) cursor = eventId
            }
          }
        } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
      } catch { /* Reconnect and re-read authoritative resources. */ }
      onStatus(false)
      if (controller.signal.aborted) break
      await new Promise<void>(resolve => { const timer = window.setTimeout(resolve, retry); controller.signal.addEventListener('abort', () => { clearTimeout(timer); resolve() }, { once: true }) }); retry = Math.min(5000, retry * 2)
    }
  }
  void run()
  return () => controller.abort()
}
