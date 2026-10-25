import express from 'express'
import cors from 'cors'
import { randomUUID } from 'node:crypto'
import { Store } from './store.mjs'
import { Service } from './service.mjs'
import { operations, validateRequest } from './contract.mjs'
import { ApiError, DAY, distance, fail, hash, id, secret } from './common.mjs'
import { merchantRestaurant, qrRestaurant } from './catalog.mjs'
import { getOrder } from './orders.mjs'
import { scheduleJob } from './reviews.mjs'
import { seed, seedReference, restrictionTargets } from './seed.mjs'
import { createLocalCode } from './local-auth.mjs'
import { readProfile, saveProfile, merchantStats } from './customer-stats.mjs'

export function createApp(options = {}) {
  const store = new Store(options.dbPath)
  const service = new Service(store, { restrictionTargets, ...options })
  store.transaction(() => seedReference(service))
  if (options.demo) store.transaction(() => seed(service))
  const app = express(), streams = new Set(), rates = new Map(), connections = new Map()
  store.transaction(() => { for (const p of store.all('party')) { p.members.forEach(m => { m.online = false }); service.put('party', p) } })
  app.disable('x-powered-by'); app.set('etag', false)
  app.use((req, res, next) => {
    req.requestId = randomUUID(); req.afterCommit = []
    res.set({ 'X-Request-ID': req.requestId, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' })
    next()
  })
  app.use('/api', cors({
    origin: [...service.options.allowedOrigins],
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'If-Match', 'Last-Event-ID'],
    exposedHeaders: ['ETag', 'X-Request-ID', 'Retry-After'],
  }))
  app.use(express.json({ limit: '128kb', strict: true }))
  app.use('/api', (req, res, next) => {
    const origin = req.get('Origin')
    // Allow only the configured frontend and the explicitly listed deployment origins.
    if (origin && !service.options.allowedOrigins.has(origin) && origin !== `${req.protocol}://${req.get('Host')}`) return next(new ApiError(403, 'FORBIDDEN', '허용되지 않은 출처예요.'))
    next()
  })
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', demo: !!options.demo, localAuth: !!options.localAuth }))
  if (options.localAuth) app.post('/api/v1/auth/local-codes', (req, res, next) => {
    try { rateLimit(req); res.json(store.transaction(() => createLocalCode(service, req.body || {}))) } catch (error) { next(error) }
  })
  if (options.demo) app.post('/api/dev/login-codes', (req, res, next) => {
    try {
      rateLimit(req)
      const body = req.body || {}
      if (Object.keys(body).some(k => !['displayName', 'merchant', 'redirectUri'].includes(k)) || typeof body.displayName !== 'string' || !body.displayName.trim() || body.displayName.length > 30 || typeof body.merchant !== 'boolean' || typeof body.redirectUri !== 'string' || !service.options.allowedOrigins.has(new URL(body.redirectUri).origin) && new URL(body.redirectUri).origin !== `${req.protocol}://${req.get('Host')}`) fail(422, 'VALIDATION_ERROR', '개발용 로그인 정보를 확인해 주세요.')
      const authorizationCode = store.transaction(() => {
        const user = body.merchant ? service.get('user', 'demo-merchant') : service.put('user', { id: id(), displayName: body.displayName.trim(), principalType: 'USER', roles: ['USER'] })
        const code = secret(); service.put('login-code', { id: hash(code), userId: user.id, redirectUri: body.redirectUri, expires: Date.now() + 60000 }); return code
      })
      res.json({ authorizationCode })
    } catch (e) { next(e) }
  })
  // Consumer preview contract added alongside the 80-operation draft. It never
  // exposes merchant ownership or uses the merchant-only management endpoint.
  app.get('/api/v1/restaurants/nearby-count', (req, res, next) => {
    try {
      req.user = service.authenticate(req)
      const keys = Object.keys(req.query), latitude = Number(req.query.latitude), longitude = Number(req.query.longitude), radius = Number(req.query.searchRadiusMeters)
      if (keys.length !== 3 || keys.some(k => !['latitude', 'longitude', 'searchRadiusMeters'].includes(k)) || !Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180 || !Number.isInteger(radius) || radius < 200 || radius > 1000) fail(422, 'VALIDATION_ERROR', '위치와 검색 반경을 확인해 주세요.')
      res.json({ count: store.all('restaurant').filter(r => !r.catalogRetired && distance({ latitude, longitude }, r.location) <= radius).length, searchRadiusMeters: radius })
    } catch (e) { next(e) }
  })
  app.get('/api/v1/me/profile', (req, res, next) => {
    try { const user = service.authenticate(req); res.json(readProfile(service, user.id)) } catch (e) { next(e) }
  })
  app.put('/api/v1/me/profile', (req, res, next) => {
    try { const user = service.authenticate(req); res.json(store.transaction(() => saveProfile(service, user.id, req.body))) } catch (e) { next(e) }
  })
  app.get('/api/v1/merchant/restaurants/:restaurantId/stats', (req, res, next) => {
    try {
      const user = service.authenticate(req)
      merchantRestaurant(service, req.params.restaurantId, user)
      const days = req.query.days === undefined ? 30 : Number(req.query.days)
      if (Object.keys(req.query).some(key => key !== 'days') || req.query.days !== undefined && typeof req.query.days !== 'string' || ![3, 7, 30].includes(days)) fail(422, 'VALIDATION_ERROR', '통계 기간은 3일, 일주일, 한 달 중 선택해 주세요.')
      res.json(store.transaction(() => merchantStats(service, req.params.restaurantId, days)))
    } catch (e) { next(e) }
  })
  for (const operation of operations) {
    const path = `/api/v1${operation.path.replace(/\{(\w+)\}/g, ':$1')}`
    app[operation.method](path, (req, res, next) => {
      try {
        const result = store.transaction(() => {
          validateRequest(req, operation)
          if (operation.security?.length !== 0) req.user = service.authenticate(req)
          else rateLimit(req)
          authorize(req, operation)
          if (operation.operationId.startsWith('stream')) return { stream: true }
          const idemParameter = operation.parameters.find(p => p.name === 'Idempotency-Key')
          const cacheId = idemParameter ? hash(`${req.user?.id || req.body?.inviteToken || req.params.qrToken || 'public'}:${req.method}:${req.path}:${req.get('Idempotency-Key')}`) : null
          const bodyHash = hash(stable(req.body ?? null))
          if (cacheId) {
            const saved = store.get('idempotency', cacheId)
            if (saved && saved.expires > Date.now()) {
              if (saved.bodyHash !== bodyHash) fail(409, 'IDEMPOTENCY_KEY_REUSED', '다른 요청에 사용한 작업 키예요.')
              return saved.result
            }
          }
          const body = service.execute(operation, req)
          const status = body?.committedError ? body.committedError.status : Number(Object.keys(operation.responses).find(s => +s < 300))
          const response = body?.committedError ? { error: { code: body.committedError.code, message: body.committedError.message, details: body.committedError.details, requestId: req.requestId } } : body
          const validate = operation.responseValidators[status]
          if (validate && !validate(response)) throw new Error(`Response contract ${operation.operationId}: ${JSON.stringify(validate.errors)}`)
          const version = response?.version || response?.revision || response?.partyVersion || response?.order?.version || response?.error?.details?.order?.version || null
          const result = { status, response, version }
          if (cacheId) service.put('idempotency', { id: cacheId, principalId: req.user?.id || null, bodyHash, expires: Date.now() + DAY, result })
          return result
        })
        if (result.stream) { stream(req, res, operation); return }
        for (const fn of req.afterCommit) fn()
        if (result.version) res.set('ETag', `"${result.version}"`)
        if (result.status === 204) res.status(204).end()
        else res.status(result.status).json(result.response)
      } catch (e) { next(e) }
    })
  }
  app.use('/api', (_req, _res, next) => next(new ApiError(404, 'RESOURCE_NOT_FOUND', 'API를 찾을 수 없어요.')))
  app.use((error, req, res, _next) => {
    if (res.headersSent) { res.end(); return }
    const status = error instanceof ApiError ? error.status : error.type === 'entity.parse.failed' ? 400 : error.type === 'entity.too.large' ? 413 : 500
    if (status === 500) console.error('Request failed', req.requestId, error.message)
    if (status === 429) res.set('Retry-After', '60')
    res.status(status).json({ error: { code: error.code || (status === 400 ? 'INVALID_REQUEST' : 'INTERNAL_ERROR'), message: status === 500 ? '처리하지 못했어요. 잠시 후 다시 시도해 주세요.' : error.message, details: error.details || {}, requestId: req.requestId } })
  })
  // Durable outbox is polled after commit, also replaying changes after a crash.
  // Every stream revalidates membership and token validity, not just at connect.
  function stream(req, res, operation) {
    const scope = operation.operationId === 'streamPartyEvents' ? `party:${req.params.partyId}` : operation.operationId === 'streamOrderEvents' ? `order:${req.params.orderId}` : `restaurant:${req.params.restaurantId}`
    const cursor = req.get('Last-Event-ID')
    let seq = store.db.prepare('SELECT COALESCE(MAX(seq),0) n FROM outbox').get().n
    if (cursor) {
      const row = store.db.prepare('SELECT seq,audience,created_at FROM outbox WHERE id=? AND scope=?').get(cursor, scope)
      if (!row || row.created_at < Date.now() - DAY || row.audience && row.audience !== req.user.id) fail(409, 'EVENT_CURSOR_EXPIRED', '최신 정보를 다시 불러와 주세요.')
      seq = row.seq
    }
    res.status(200).set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' }); res.flushHeaders(); res.write(': connected\n\n')
    const partyId = req.params.partyId || (req.params.orderId ? service.store.get('order', req.params.orderId)?.partyId : null)
    if (partyId && req.user) setOnline(partyId, req.user.id, 1)
    let closed = false
    const connection = { close: () => { if (closed) return; closed = true; clearInterval(timer); streams.delete(connection); if (partyId) setOnline(partyId, req.user.id, -1); res.end() } }
    let heartbeat = Date.now(), lastAuth = 0
    const poll = () => {
      try {
        const rows = store.db.prepare('SELECT seq,body,audience FROM outbox WHERE scope=? AND seq>? ORDER BY seq LIMIT 100').all(scope, seq)
        for (const row of rows) {
          seq = row.seq
          if (row.audience && row.audience !== req.user.id) continue
          const event = JSON.parse(row.body)
          if (res.writableLength > 1024 * 1024) { connection.close(); return }
          res.write(`id: ${event.eventId}\nevent: ${event.type}\ndata: ${row.body}\n\n`)
        }
        if (Date.now() - lastAuth > 1000) { service.authenticate(req); authorize(req, operation); lastAuth = Date.now() }
        if (Date.now() - heartbeat >= 15000) { res.write(': heartbeat\n\n'); heartbeat = Date.now() }
      } catch { res.write('event: session.expired\ndata: {}\n\n'); connection.close() }
    }
    const timer = setInterval(poll, 150); timer.unref(); streams.add(connection)
    res.on('close', connection.close)
    poll()
  }
  function setOnline(partyId, userId, delta) {
    const key = `${partyId}:${userId}`, count = Math.max(0, (connections.get(key) || 0) + delta)
    if (count) connections.set(key, count); else connections.delete(key)
    store.transaction(() => {
      const p = store.get('party', partyId), me = p?.members.find(m => m.userId === userId)
      if (!me || !!me.online === (count > 0)) return
      me.online = count > 0; service.put('party', p)
      service.event(`party:${p.id}`, 'party.member_updated', p, { memberId: me.id, connectionStatus: me.online ? 'ONLINE' : 'OFFLINE' })
    })
  }
  function authorize(req, op) {
    if (req.params.partyId) service.party(req.params.partyId, req.user)
    if (req.params.orderId) getOrder(service, req, op.path.startsWith('/merchant'))
    if (req.params.restaurantId) merchantRestaurant(service, req.params.restaurantId, req.user)
    if (req.params.menuId) { const m = service.get('menu', req.params.menuId); merchantRestaurant(service, m.restaurantId, req.user) }
    if (req.params.commissionId) { const c = service.get('commission', req.params.commissionId); merchantRestaurant(service, c.restaurantId, req.user) }
    if (req.params.jobId) { const j = service.get('job', req.params.jobId); service.party(j.partyId, req.user) }
    if (op.operationId === 'createPartyGuestSession' || op.operationId === 'joinParty') {
      const token = req.body?.inviteToken || req.params.inviteToken, invite = store.get('invite', hash(token))
      if (!invite || Date.parse(invite.expiresAt) <= Date.now()) fail(410, 'INVITE_EXPIRED', '초대 링크가 만료됐어요.')
    }
    if (req.params.qrToken) qrRestaurant(service, req.params.qrToken)
  }
  function rateLimit(req) {
    const ip = req.socket.remoteAddress, window = Math.floor(Date.now() / 60000), key = `${ip}:${window}`
    const count = (rates.get(key) || 0) + 1; rates.set(key, count)
    if (rates.size > 1000) for (const k of rates.keys()) if (!k.endsWith(`:${window}`)) rates.delete(k)
    if (count > (options.rateLimit || 120)) fail(429, 'RATE_LIMITED', '요청이 많아요. 잠시 후 다시 시도해 주세요.')
  }
  const cleanup = setInterval(() => store.transaction(() => service.expireGuests()), 60000); cleanup.unref()
  store.transaction(() => service.expireGuests())
  for (const job of store.all('job').filter(j => ['QUEUED', 'PROCESSING'].includes(j.status))) scheduleJob(service, job.id)
  return { app, service, store, close() { clearInterval(cleanup); service.timers.forEach(clearTimeout); for (const s of [...streams]) s.close(); store.close() } }
}
function stable(value) { if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`; if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`; return JSON.stringify(value) }
