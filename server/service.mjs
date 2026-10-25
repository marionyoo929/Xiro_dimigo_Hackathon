import { DAY, fail, hash, host, id, match, member, missing, newMember, now, publicMember, publicParty, publicUser, secret, state } from './common.mjs'
import { catalogHandlers } from './catalog.mjs'
import { reviewHandlers } from './reviews.mjs'
import { orderHandlers, orderChanged } from './orders.mjs'

export class Service {
  constructor(store, options = {}) {
    this.store = store
    this.options = { demo: false, maxMembers: 8, origin: 'http://localhost:5173', ...options }
    this.options.origin = new URL(this.options.origin).origin
    if (!Number.isInteger(this.options.maxMembers) || this.options.maxMembers < 1 || this.options.maxMembers > 100) throw new Error('MAX_MEMBERS must be 1–100')
    this.handlers = { ...catalogHandlers, ...reviewHandlers, ...orderHandlers, ...handlers }
    this.timers = new Set()
    this.orderChanged = orderChanged
  }
  get(kind, key) { return this.store.get(kind, key) || missing() }
  put(kind, value, uniqueKey) { return this.store.put(kind, value, uniqueKey) }
  party(key, user) { const p = this.get('party', key); member(p, user); return p }
  restrictions(userId) { return this.store.get('restriction', userId) || { id: userId, items: [], revision: 1 } }
  restrictionsPublic(userId) { const { items, revision } = this.restrictions(userId); return { items, revision } }
  partyRestrictions(partyId) { return this.store.get('party-restrictions', partyId)?.items || [] }
  requireActiveGuests(party) {
    if (party.members.some(m => { const u = this.get('user', m.userId); return u.principalType !== 'USER' && u.created + DAY <= Date.now() })) fail(409, 'GUEST_SESSION_EXPIRED', '게스트 참여가 만료됐어요. 파티를 취소하고 다시 시작해 주세요.')
  }
  authenticate(req) {
    const token = req.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1]
    if (!token) fail(401, 'UNAUTHORIZED', '로그인이 필요해요.')
    const session = this.store.get('session', hash(token))
    if (!session || session.revoked || session.expires <= Date.now()) fail(401, 'TOKEN_EXPIRED', '로그인이 만료됐어요.')
    const user = this.get('user', session.userId)
    if (user.principalType !== 'USER') {
      const resource = this.store.get(user.principalType === 'PARTY_GUEST' ? 'party' : 'order', user.scopeId)
      const terminal = resource && (user.principalType === 'PARTY_GUEST' ? ['CANCELED', 'ORDER_CONFIRMED', 'ORDER_REJECTED'].includes(resource.state) : ['CANCELED', 'CONFIRMED', 'REJECTED'].includes(resource.status))
      if (!resource || terminal) fail(401, 'GUEST_SESSION_EXPIRED', '게스트 참여가 종료됐어요.')
    }
    req.session = session
    return user
  }
  tokens(user, guest = false) {
    const accessToken = secret(), refreshToken = secret(), expiresIn = guest ? 86400 : 3600
    const session = { id: hash(accessToken), userId: user.id, expires: Date.now() + expiresIn * 1000, refreshHash: guest ? null : hash(refreshToken), refreshExpires: Date.now() + 30 * DAY, revoked: false }
    this.put('session', session)
    return guest ? { guestToken: accessToken, expiresAt: new Date(session.expires).toISOString(), guestUser: publicUser(user) }
      : { accessToken, refreshToken, tokenType: 'Bearer', expiresIn, user: publicUser(user) }
  }
  event(scope, type, resource, data = {}, audience = null) {
    const event = { eventId: id(), type, occurredAt: now(), resourceVersion: resource.version || 1, data }
    if (scope.startsWith('party:')) event.partyId = resource.id
    if (scope.startsWith('order:')) { event.orderId = resource.id; event.partyId = resource.partyId }
    if (scope.startsWith('restaurant:')) event.restaurantId = resource.id
    this.store.db.prepare('INSERT INTO outbox(id,scope,audience,created_at,body) VALUES(?,?,?,?,?)').run(event.eventId, scope, audience, Date.now(), JSON.stringify(event))
  }
  partyChanged(party, type = 'party.stage_changed', data = {}) {
    party.version++
    this.put('party', party)
    this.event(`party:${party.id}`, type, party, { state: party.state, ...data })
  }
  audit(user, type, resource, before, requestId) { this.put('audit', { id: id(), userId: user.id, type, resourceId: resource.id, before, after: resource.status || resource.state, requestId, occurredAt: now() }) }
  analysis(type, resourceId, userId = null) { this.put('analysis', { id: id(), type, resourceId, actor: userId ? hash(`analysis:${userId}`) : null, occurredAt: now() }) }
  expireGuests() {
    for (const user of this.store.all('user').filter(u => u.principalType !== 'USER')) {
      const resource = this.store.get(user.principalType === 'PARTY_GUEST' ? 'party' : 'order', user.scopeId)
      const expired = user.created + DAY <= Date.now()
      const terminal = resource && (resource.state ? ['CANCELED', 'ORDER_CONFIRMED', 'ORDER_REJECTED'].includes(resource.state) : ['CONFIRMED', 'REJECTED', 'CANCELED'].includes(resource.status))
      if (expired || terminal) {
        for (const snapshot of this.store.all('party-restrictions')) {
          if (snapshot.items.some(r => r.ownerUserId === user.id)) this.put('party-restrictions', { ...snapshot, items: snapshot.items.filter(r => r.ownerUserId !== user.id) })
        }
        for (const cached of this.store.all('idempotency').filter(e => e.principalId === user.id)) this.store.delete('idempotency', cached.id)
        this.store.delete('restriction', user.id)
        this.store.delete('customer-profile', user.id)
        for (const session of this.store.all('session').filter(s => s.userId === user.id && !s.revoked)) this.put('session', { ...session, revoked: true })
        if (expired && resource?.type === 'QR_GUEST' && resource.status === 'DRAFT') { resource.status = 'CANCELED'; this.orderChanged(resource, 'order.canceled') }
      }
    }
    // Response caches contain tokens; keep them no longer than the contract window.
    for (const entry of this.store.all('idempotency')) if (entry.expires <= Date.now()) this.store.delete('idempotency', entry.id)
    for (const entry of this.store.all('login-code')) if (entry.expires <= Date.now()) this.store.delete('login-code', entry.id)
    this.store.db.prepare('DELETE FROM outbox WHERE created_at < ?').run(Date.now() - DAY)
  }
  execute(operation, req) {
    const handler = this.handlers[operation.operationId]
    if (!handler) throw new Error(`Missing handler ${operation.operationId}`)
    return handler.call(this, req)
  }
  page(items, req, extra = {}) {
    // Cursor binds the offset to the endpoint and all filters to prevent reuse.
    const query = Object.fromEntries(Object.entries(req.query).filter(([k]) => k !== 'cursor').sort(([a], [b]) => a.localeCompare(b)))
    const scope = hash(`${req.path}:${req.user?.id || 'public'}:${JSON.stringify(query)}`)
    let offset = 0
    if (req.query.cursor) {
      try { const cursor = JSON.parse(Buffer.from(req.query.cursor, 'base64url').toString()); if (cursor.scope !== scope || !Number.isSafeInteger(cursor.offset) || cursor.offset < 0 || cursor.offset > items.length) throw Error(); offset = cursor.offset }
      catch { fail(400, 'INVALID_CURSOR', '목록을 처음부터 다시 조회해 주세요.') }
    }
    const limit = Number(req.query.limit || 20), end = offset + limit
    return { items: items.slice(offset, end), nextCursor: end < items.length ? Buffer.from(JSON.stringify({ offset: end, scope })).toString('base64url') : null, ...extra }
  }
}

const handlers = {
  login(req) {
    // A real provider must verify its authorization code; none is configured by
    // the draft. Demo codes are single-use and only issued in explicit demo mode.
    if (!(this.options.demo && req.body.provider === 'demo') && !(this.options.localAuth && req.body.provider === 'local')) fail(503, 'SERVICE_UNAVAILABLE', '로그인 공급자가 아직 설정되지 않았어요.')
    const code = this.store.get('login-code', hash(req.body.authorizationCode))
    if (!code || code.expires < Date.now() || code.redirectUri !== req.body.redirectUri || (code.provider || 'demo') !== req.body.provider) fail(401, 'UNAUTHORIZED', '로그인 코드를 확인해 주세요.')
    this.store.delete('login-code', code.id)
    return this.tokens(this.get('user', code.userId))
  },
  refreshTokens(req) {
    const session = this.store.all('session').find(s => s.refreshHash === hash(req.body.refreshToken))
    if (!session || session.revoked || session.refreshExpires < Date.now()) fail(401, 'UNAUTHORIZED', '다시 로그인해 주세요.')
    this.put('session', { ...session, revoked: true })
    return this.tokens(this.get('user', session.userId))
  },
  logout(req) {
    const session = this.store.all('session').find(s => s.refreshHash === hash(req.body.refreshToken))
    if (!session || session.userId !== req.user.id) fail(401, 'UNAUTHORIZED', '로그인 정보를 확인해 주세요.')
    this.put('session', { ...session, revoked: true })
    return null
  },
  getMe(req) { return publicUser(req.user) },
  getDietaryRestrictions(req) { return this.restrictionsPublic(req.user.id) },
  replaceDietaryRestrictions(req) { return modifyRestrictions.call(this, req, req.body.items) },
  addDietaryRestriction(req) { return modifyRestrictions.call(this, req, [...this.restrictions(req.user.id).items, req.body]) },
  deleteDietaryRestriction(req) {
    const current = this.restrictions(req.user.id)
    if (!current.items.some(r => r.id === req.params.restrictionId)) missing()
    return modifyRestrictions.call(this, req, current.items.filter(r => r.id !== req.params.restrictionId))
  },
  createParty(req) {
    if (req.user.principalType !== 'USER' || !req.user.roles.includes('USER')) fail(403, 'FORBIDDEN', '사용자 계정으로 파티를 만들 수 있어요.')
    const me = newMember(req.user, 'HOST')
    const party = { id: id(), ...req.body, scheduledAt: req.body.scheduledAt ?? null, budgetPerPerson: req.body.budgetPerPerson ?? null,
      hostMemberId: me.id, state: 'WAITING', version: 1, maxMembers: this.options.maxMembers, members: [me], sets: [], selectedRestaurantId: null, orderId: null, generationJobId: null, createdAt: now() }
    this.put('party', party)
    return publicParty(party, req.user)
  },
  getParty(req) { return publicParty(this.party(req.params.partyId, req.user), req.user) },
  updateParty(req) {
    const party = this.party(req.params.partyId, req.user); host(party, req.user); match(req, party.version); state(party, 'WAITING')
    Object.assign(party, req.body); this.partyChanged(party)
    return publicParty(party, req.user)
  },
  cancelParty(req) {
    const party = this.party(req.params.partyId, req.user); host(party, req.user); match(req, party.version)
    state(party, 'WAITING', 'CATEGORY_GENERATING', 'CATEGORY_REVIEW', 'CATEGORY_FINALIZED', 'RESTAURANT_GENERATING', 'RESTAURANT_REVIEW', 'RESTAURANT_FINALIZED', 'RESTAURANT_SELECTED', 'ORDERING')
    party.state = 'CANCELED'; this.partyChanged(party, 'party.canceled')
    if (party.orderId) { const o = this.get('order', party.orderId); o.status = 'CANCELED'; this.orderChanged(o, 'order.canceled') }
    if (party.generationJobId) { const j = this.get('job', party.generationJobId); if (['QUEUED', 'PROCESSING'].includes(j.status)) this.put('job', { ...j, status: 'CANCELED', completedAt: now() }) }
    this.expireGuests()
    return null
  },
  listMyParties(req) { return this.page(this.store.all('party').filter(p => p.members.some(m => m.userId === req.user.id)).map(p => publicParty(p, req.user)), req) },
  createInviteLink(req) {
    const party = this.party(req.params.partyId, req.user); host(party, req.user); state(party, 'WAITING')
    const inviteToken = secret(), expiresAt = new Date(Date.now() + (req.body.expiresInSeconds || 86400) * 1000).toISOString()
    this.put('invite', { id: hash(inviteToken), partyId: party.id, expiresAt })
    return { inviteToken, inviteUrl: `${this.options.origin}/invite/${inviteToken}`, expiresAt }
  },
  createPartyGuestSession(req) {
    const party = inviteParty.call(this, req.body.inviteToken)
    const user = this.put('user', { id: id(), displayName: req.body.displayName, principalType: 'PARTY_GUEST', roles: [], scopeId: party.id, created: Date.now() })
    const me = join.call(this, party, user)
    return { ...this.tokens(user, true), partyId: party.id, memberId: me.id }
  },
  joinParty(req) {
    if (req.user.principalType !== 'USER') fail(403, 'FORBIDDEN', '로그인한 사용자만 이 경로로 참여할 수 있어요.')
    return publicMember(join.call(this, inviteParty.call(this, req.params.inviteToken), req.user))
  },
  listPartyMembers(req) { return this.page(this.party(req.params.partyId, req.user).members.map(publicMember), req) },
  removePartyMember(req) {
    const p = this.party(req.params.partyId, req.user), me = member(p, req.user), target = p.members.find(m => m.id === req.params.memberId) || missing()
    state(p, 'WAITING')
    if (target.role === 'HOST') fail(409, 'HOST_CANNOT_LEAVE', '방장은 파티를 취소해 주세요.')
    if (me.id !== target.id) host(p, req.user)
    p.members = p.members.filter(m => m.id !== target.id)
    this.partyChanged(p, 'party.member_left', { memberId: target.id })
    const u = this.get('user', target.userId)
    if (u.principalType === 'PARTY_GUEST') { this.store.delete('restriction', u.id); for (const s of this.store.all('session').filter(s => s.userId === u.id)) this.put('session', { ...s, revoked: true }) }
    return null
  },
  updateMyPartyMember(req) { const p = this.party(req.params.partyId, req.user); state(p, 'WAITING'); const me = member(p, req.user); me.displayName = req.body.displayName; this.partyChanged(p, 'party.member_updated', { memberId: me.id }); return publicMember(me) },
  confirmMyDietaryRestrictions(req) {
    const p = this.party(req.params.partyId, req.user); state(p, 'WAITING'); const me = member(p, req.user), revision = this.restrictions(req.user.id).revision
    if (req.body.restrictionRevision !== revision) fail(409, 'RESTRICTION_CONFIRMATION_REQUIRED', '최신 식사 제한을 확인해 주세요.')
    me.restrictionConfirmed = req.body.confirmed; me.restrictionRevision = revision
    this.partyChanged(p, 'party.member_updated', { memberId: me.id }); return publicMember(me)
  },
  getJob(req) { const job = this.get('job', req.params.jobId); this.party(job.partyId, req.user); return job },
}

function inviteParty(token) {
  const invite = this.store.get('invite', hash(token))
  if (!invite || Date.parse(invite.expiresAt) <= Date.now()) fail(410, 'INVITE_EXPIRED', '초대 링크가 만료됐어요.')
  return this.get('party', invite.partyId)
}
function join(party, user) {
  const existing = party.members.find(m => m.userId === user.id)
  if (existing) return existing
  state(party, 'WAITING')
  if (party.members.length >= party.maxMembers) fail(409, 'PARTY_FULL', '파티 정원이 찼어요.')
  const me = newMember(user); party.members.push(me)
  this.partyChanged(party, 'party.member_joined', { memberId: me.id }); return me
}
function modifyRestrictions(req, items) {
  const current = this.restrictions(req.user.id); match(req, current.revision)
  if (items.length > 50) fail(422, 'VALIDATION_ERROR', '식사 제한은 50개까지 등록할 수 있어요.')
  const seen = new Set()
  for (const item of items) {
    if (!this.options.restrictionTargets.some(t => t.code === item.targetCode) || !['ALLERGY', 'RELIGIOUS', 'VEGETARIAN', 'INGREDIENT_AVOIDANCE', 'MEDICAL', 'OTHER'].includes(item.type) || seen.has(item.targetCode)) fail(422, 'VALIDATION_ERROR', '식사 제한 코드를 확인해 주세요.')
    seen.add(item.targetCode)
  }
  this.put('restriction', { id: req.user.id, revision: current.revision + 1, items: items.map(item => ({ ...item, id: item.id || id() })) })
  for (const p of this.store.all('party').filter(p => p.state === 'WAITING' && p.members.some(m => m.userId === req.user.id))) {
    const me = member(p, req.user); me.restrictionConfirmed = false; this.partyChanged(p, 'party.member_updated', { memberId: me.id })
  }
  for (const order of this.store.all('order').filter(o => o.type === 'QR_GUEST' && o.status === 'DRAFT' && o.members.some(m => m.userId === req.user.id))) {
    order.members.forEach(m => { m.selectionStatus = 'IN_PROGRESS' }); this.orderChanged(order, 'order.draft_updated')
  }
  return this.restrictionsPublic(req.user.id)
}
