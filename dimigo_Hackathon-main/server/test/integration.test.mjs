import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../app.mjs'
import { operations } from '../contract.mjs'
import { provisionAccount } from '../local-auth.mjs'

async function fixture(t, dbPath) {
  const instance = createApp({ demo: true, rateLimit: 10000, dbPath })
  const server = instance.app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r))
  const base = `http://127.0.0.1:${server.address().port}/api`
  t.after(async () => { instance.close(); server.closeAllConnections(); await new Promise(r => server.close(r)) })
  async function request(path, { token, method = 'GET', body, version, key, status = 200 } = {}) {
    const response = await fetch(`${base}${path.startsWith('/dev') ? '' : '/v1'}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(method !== 'GET' ? { 'Idempotency-Key': key || crypto.randomUUID() } : {}), ...(version !== undefined ? { 'If-Match': `"${version}"` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
    const data = response.status === 204 ? null : await response.json()
    assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(data)}`)
    return data
  }
  const login = async (displayName, merchant = false) => {
    const { authorizationCode } = await request('/dev/login-codes', { method: 'POST', body: { displayName, merchant, redirectUri: 'http://localhost:5173/' } })
    return request('/auth/login', { method: 'POST', body: { provider: 'demo', authorizationCode, redirectUri: 'http://localhost:5173/' } })
  }
  return { ...instance, request, login, base }
}
const partyBody = { title: '함께 점심', location: { latitude: 37.566826, longitude: 126.9786567, address: '서울시청' }, searchRadiusMeters: 1000, budgetPerPerson: 25000, mealStyle: 'INDIVIDUAL_ORDER' }
const item = menuId => ({ menuId, quantity: 1, options: [], request: '' })
async function pollJob(request, job, token) {
  for (let i = 0; i < 60; i++) { const value = await request(`/jobs/${job.id}`, { token }); if (['SUCCEEDED', 'FAILED', 'CANCELED'].includes(value.status)) return value; await new Promise(r => setTimeout(r, 10)) }
  assert.fail('Job did not finish')
}
test('all 80 draft operations have handlers; demo is opt-in', async t => {
  const f = await fixture(t)
  assert.equal(operations.length, 80)
  for (const op of operations) assert.ok(f.service.handlers[op.operationId] || op.operationId.startsWith('stream'), op.operationId)
  const production = createApp(); t.after(() => production.close())
  assert.equal(production.store.all('restaurant').length, 0)
  assert.equal(production.store.all('user').length, 0)
  const bad = await f.request('/auth/login', { method: 'POST', body: { provider: 'unconfigured', authorizationCode: 'x', redirectUri: 'https://example.com' }, status: 503 }); assert.equal(bad.error.code, 'SERVICE_UNAVAILABLE')
})
test('two participants: shared anonymous elimination → restaurant → group order → merchant confirmation, idempotency and access control', async t => {
  const f = await fixture(t), { request, login } = f
  const host = await login('방장'), friend = await login('친구'), outsider = await login('외부인'), merchant = await login('사장님', true)
  const a = host.accessToken, b = friend.accessToken, m = merchant.accessToken
  await request('/parties', { token: a, method: 'POST', body: { ...partyBody, role: 'HOST' }, status: 422 })
  const createKey = crypto.randomUUID()
  let p = await request('/parties', { token: a, method: 'POST', body: partyBody, key: createKey, status: 201 })
  assert.equal((await request('/parties', { token: a, method: 'POST', body: partyBody, key: createKey, status: 201 })).id, p.id)
  await request('/parties', { token: a, method: 'POST', body: { ...partyBody, title: 'changed' }, key: createKey, status: 409 })
  const pp = `/parties/${p.id}`
  await request(pp, { token: outsider.accessToken, status: 404 })
  await request(pp, { token: a, method: 'PATCH', body: { title: '바뀐 모임' }, version: 99, status: 412 })
  const invite = await request(`${pp}/invite-links`, { token: a, method: 'POST', body: {}, status: 201 })
  await request(`/party-invites/${invite.inviteToken}/join`, { token: b, method: 'POST' })
  p = await request(pp, { token: a }); assert.equal(p.memberCount, 2)
  await request(pp, { token: b, method: 'PATCH', body: { title: '불법 수정' }, version: p.version, status: 403 })
  for (const token of [a, b]) await request(`${pp}/members/me/dietary-confirmation`, { token, method: 'PUT', body: { confirmed: true, restrictionRevision: 1 } })
  let job = await request(`${pp}/category-candidates/generate`, { token: a, method: 'POST', status: 202 })
  assert.equal((await pollJob(request, job, a)).status, 'SUCCEEDED')
  await request(`/party-invites/${invite.inviteToken}/join`, { token: outsider.accessToken, method: 'POST', status: 409 })
  let candidates = await request(`${pp}/category-candidates`, { token: a })
  const target = candidates.items[0], cp = `${pp}/category-candidates/${target.id}`
  await request(`${cp}/elimination`, { token: a, method: 'PUT' })
  await request(`${cp}/elimination`, { token: b, method: 'PUT' })
  const restored = await request(`${cp}/elimination`, { token: a, method: 'DELETE' }); assert.equal(restored.status, 'ELIMINATED'); assert.equal(restored.eliminatedByMe, false)
  const visible = await request(cp, { token: a }); assert.equal(visible.eliminatedByMe, false); assert.equal(visible.status, 'ELIMINATED'); assert.ok(!JSON.stringify(visible).includes('eliminator'))
  await request(`${pp}/category-review/complete`, { token: a, method: 'POST', status: 409 })
  for (const token of [a, b]) {
    for (const c of candidates.items) await request(`${pp}/category-candidates/${c.id}/view`, { token, method: 'POST' })
    await request(`${pp}/category-review/complete`, { token, method: 'POST' })
  }
  await request(`${cp}/elimination`, { token: a, method: 'PUT', status: 409 })
  // Reopening and changing the aggregate resets every participant's completion.
  await request(`${pp}/category-review/complete`, { token: b, method: 'DELETE' })
  await request(`${cp}/elimination`, { token: b, method: 'DELETE' })
  assert.equal((await request(`${pp}/category-review/progress`, { token: a })).partyCompletedMemberCount, 0)
  for (const token of [a, b]) await request(`${pp}/category-review/complete`, { token, method: 'POST' })
  p = await request(pp, { token: a }); p = await request(`${pp}/category-review/finalize`, { token: a, method: 'POST', version: p.version })
  await request(`${cp}/elimination`, { token: a, method: 'PUT', status: 409 })
  job = await request(`${pp}/restaurant-candidates/generate`, { token: a, method: 'POST', status: 202 }); assert.equal((await pollJob(request, job, a)).status, 'SUCCEEDED')
  candidates = await request(`${pp}/restaurant-candidates`, { token: a })
  const restaurant = candidates.items[0]
  await request(`${pp}/restaurant-candidates/${restaurant.id}/menus`, { token: b })
  for (const token of [a, b]) {
    for (const c of candidates.items) await request(`${pp}/restaurant-candidates/${c.id}/view`, { token, method: 'POST' })
    await request(`${pp}/restaurant-review/complete`, { token, method: 'POST' })
  }
  p = await request(pp, { token: a }); p = await request(`${pp}/restaurant-review/finalize`, { token: a, method: 'POST', version: p.version })
  p = await request(`${pp}/selected-restaurant`, { token: a, method: 'PUT', version: p.version, body: { restaurantCandidateId: restaurant.id } })
  const rid = p.selectedRestaurantId
  const wrongId = (await request('/merchant/restaurants', { token: m })).items.find(r => r.id !== rid).id
  const wrongQr = await request(`/merchant/restaurants/${wrongId}/qr-codes`, { token: m, method: 'POST', status: 201 })
  await request(`${pp}/store-connection`, { token: a, method: 'POST', version: p.version, body: { qrToken: wrongQr.qrToken }, status: 409 })
  const qr = await request(`/merchant/restaurants/${rid}/qr-codes`, { token: m, method: 'POST', status: 201 })
  let o = (await request(`${pp}/store-connection`, { token: a, method: 'POST', version: p.version, body: { qrToken: qr.qrToken } })).order
  assert.equal((await request(`${pp}/orders`, { token: a, method: 'POST' })).id, o.id)
  const op = `/orders/${o.id}`, menu = (await request(`${op}/menus`, { token: a })).items.find(m => m.salesStatus === 'AVAILABLE')
  o = await request(`${op}/my-items`, { token: a, method: 'POST', version: o.version, body: item(menu.id), status: 201 })
  const hostItem = o.members.find(m => m.memberId === o.myMemberId).items[0]
  await request(`${op}/my-items/${hostItem.id}`, { token: b, method: 'PATCH', version: o.version, body: { quantity: 2 }, status: 404 })
  await request(`${op}/my-items`, { token: b, method: 'POST', version: o.version, body: { ...item(menu.id), unitPrice: 1 }, status: 422 })
  o = await request(`${op}/my-items`, { token: b, method: 'POST', version: o.version, body: item(menu.id), status: 201 })
  for (const token of [a, b]) o = await request(`${op}/members/me/complete`, { token, method: 'POST', version: o.version })
  await request(`${op}/submit`, { token: b, method: 'POST', version: o.version, status: 403 })
  await request(`/merchant/menus/${menu.id}`, { token: m, method: 'PATCH', body: { price: menu.price + 1000 } })
  const priceConflict = await request(`${op}/submit`, { token: a, method: 'POST', version: o.version, status: 409 })
  assert.equal(priceConflict.error.code, 'ORDER_PRICE_CHANGED'); o = priceConflict.error.details.order
  assert.equal(o.members.every(m => m.selectionStatus === 'IN_PROGRESS'), true)
  for (const token of [a, b]) o = await request(`${op}/members/me/complete`, { token, method: 'POST', version: o.version })
  const submitKey = crypto.randomUUID(), version = o.version
  o = await request(`${op}/submit`, { token: a, method: 'POST', version, key: submitKey })
  assert.equal((await request(`${op}/submit`, { token: a, method: 'POST', version, key: submitKey })).id, o.id)
  await request(`${op}/my-items/${hostItem.id}`, { token: a, method: 'PATCH', version: o.version, body: { quantity: 2 }, status: 409 })
  const confirmKey = crypto.randomUUID()
  const accepted = await request(`/merchant/orders/${o.id}/confirm`, { token: m, method: 'POST', version: o.version, key: confirmKey })
  const repeated = await request(`/merchant/orders/${o.id}/confirm`, { token: m, method: 'POST', version: o.version, key: confirmKey })
  assert.equal(accepted.commission.id, repeated.commission.id); assert.equal(accepted.commission.feeAmount, null); assert.equal(accepted.commission.status, 'PENDING')
  await request(`/merchant/orders/${o.id}/reject`, { token: m, method: 'POST', version: accepted.order.version, body: { reasonCode: 'OTHER', message: '경합' }, status: 409 })
  await request(`/merchant/menus/${menu.id}`, { token: m, method: 'DELETE', status: 204 })
  const final = await request(op, { token: a }); assert.equal(final.status, 'CONFIRMED'); assert.equal(final.members[0].items[0].menuName, hostItem.menuName)
  assert.equal((await request('/merchant/commissions', { token: m })).items.length, 1)
  assert.ok(!JSON.stringify(final).includes('restriction'))
  const outbox = f.store.db.prepare("SELECT body FROM outbox WHERE body LIKE '%eliminated%'").all()
  assert.ok(outbox.length > 0); for (const row of outbox) assert.ok(!/eliminators|eliminatedByMe|userId|displayName/.test(row.body))
})
test('QR guest orders, restriction conservatism, options and revocation', async t => {
  const { request, login, store } = await fixture(t), merchant = await login('사장님', true), m = merchant.accessToken
  const r = (await request('/merchant/restaurants', { token: m })).items[0]
  const qr = await request(`/merchant/restaurants/${r.id}/qr-codes`, { token: m, method: 'POST', status: 201 })
  const guest = await request(`/store-qr/${qr.qrToken}/guest-order-sessions`, { method: 'POST', body: { displayName: '손님', deviceId: 'test-device' }, status: 201 }), token = guest.guestToken
  const op = `/orders/${guest.order.id}`
  await request('/me/parties', { token }); await request('/parties', { token, method: 'POST', body: partyBody, status: 403 })
  let restrictions = await request('/me/dietary-restrictions', { token })
  restrictions = await request('/me/dietary-restrictions', { token, method: 'POST', version: restrictions.revision, body: { type: 'ALLERGY', targetCode: 'WHEAT', label: '밀', severity: 'HARD_BLOCK' }, status: 201 })
  const menus = (await request(`${op}/menus`, { token })).items
  assert.ok(menus.every(menu => !menu.allergenCodes.includes('WHEAT')))
  let o = await request(op, { token }), menu = menus.find(m => m.salesStatus === 'AVAILABLE')
  const options = [{ id: 'size', name: '크기', minSelections: 1, maxSelections: 1, values: [{ id: 'large', name: '곱빼기', additionalPrice: 1000, salesStatus: 'AVAILABLE' }] }]
  await request(`/merchant/menus/${menu.id}`, { token: m, method: 'PATCH', body: { options } })
  await request(`${op}/my-items`, { token, method: 'POST', version: o.version, body: item(menu.id), status: 422 })
  o = await request(`${op}/my-items`, { token, method: 'POST', version: o.version, body: { ...item(menu.id), options: [{ optionId: 'size', valueId: 'large' }] }, status: 201 })
  assert.equal(o.totalAmount, menu.price + 1000)
  o = await request(`${op}/members/me/complete`, { token, method: 'POST', version: o.version })
  o = await request(`${op}/submit`, { token, method: 'POST', version: o.version })
  await request(`/merchant/restaurants/${r.id}/qr-codes/${qr.id}`, { token: m, method: 'DELETE', status: 204 })
  await request(`/store-qr/${qr.qrToken}`, { status: 410 })
  await request(`/merchant/orders/${o.id}/confirm`, { token: m, method: 'POST', version: o.version })
  await request(op, { token, status: 401 })
  assert.equal(store.all('restriction').length, 0)
})
test('data survives restart, sessions rotate, no fallback candidates and canceled generation stays canceled', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'xiro-test-'))
  const f = await fixture(t, join(dir, 'state.sqlite')), user = await f.login('방장'), a = user.accessToken
  let p = await f.request('/parties', { token: a, method: 'POST', body: { ...partyBody, location: { latitude: 0, longitude: 0 } }, status: 201 })
  const pp = `/parties/${p.id}`
  await f.request(`${pp}/members/me/dietary-confirmation`, { token: a, method: 'PUT', body: { confirmed: true, restrictionRevision: 1 } })
  const job = await f.request(`${pp}/category-candidates/generate`, { token: a, method: 'POST', status: 202 })
  assert.equal((await pollJob(f.request, job, a)).status, 'FAILED'); assert.equal((await f.request(pp, { token: a })).state, 'WAITING')
  p = await f.request(pp, { token: a }); await f.request(pp, { token: a, method: 'PATCH', body: { location: partyBody.location }, version: p.version })
  f.service.options.jobDelay = 1000
  const next = await f.request(`${pp}/category-candidates/generate`, { token: a, method: 'POST', status: 202 })
  p = await f.request(pp, { token: a }); await f.request(pp, { token: a, method: 'DELETE', version: p.version, status: 204 })
  assert.equal((await pollJob(f.request, next, a)).status, 'CANCELED')
  const fresh = await f.request('/auth/refresh', { method: 'POST', body: { refreshToken: user.refreshToken } })
  await f.request('/me', { token: a, status: 401 }); await f.request('/auth/refresh', { method: 'POST', body: { refreshToken: user.refreshToken }, status: 401 })
  const second = createApp({ dbPath: join(dir, 'state.sqlite') }); t.after(() => second.close())
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  assert.equal(second.store.get('party', p.id).state, 'CANCELED')
  assert.equal(second.store.get('user', fresh.user.id).displayName, '방장')
})

test('SSE authorization, private views, reconnect replay, expired cursor and stream revocation', async t => {
  const f = await fixture(t), a = (await f.login('방장')).accessToken, b = (await f.login('친구')).accessToken, outsider = (await f.login('외부')).accessToken
  const p = await f.request('/parties', { token: a, method: 'POST', body: partyBody, status: 201 }), pp = `/parties/${p.id}`
  const invite = await f.request(`${pp}/invite-links`, { token: a, method: 'POST', body: {}, status: 201 })
  await f.request(`/party-invites/${invite.inviteToken}/join`, { token: b, method: 'POST' })
  await f.request(`${pp}/events`, { token: outsider, status: 404 })
  const controller = new AbortController()
  const response = await fetch(`${f.base}/v1${pp}/events`, { headers: { Authorization: `Bearer ${a}`, Accept: 'text/event-stream' }, signal: controller.signal })
  assert.equal(response.status, 200)
  const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = ''
  const readUntil = async text => {
    const timeout = setTimeout(() => controller.abort(), 3000)
    try { while (!buffer.includes(text)) { const { value, done } = await reader.read(); if (done) break; buffer += decoder.decode(value) } assert.ok(buffer.includes(text), buffer); return buffer }
    finally { clearTimeout(timeout) }
  }
  for (const token of [a, b]) await f.request(`${pp}/members/me/dietary-confirmation`, { token, method: 'PUT', body: { confirmed: true, restrictionRevision: 1 } })
  const job = await f.request(`${pp}/category-candidates/generate`, { token: a, method: 'POST', status: 202 }); await pollJob(f.request, job, a)
  const candidate = (await f.request(`${pp}/category-candidates`, { token: a })).items[0]
  await f.request(`${pp}/category-candidates/${candidate.id}/view`, { token: b, method: 'POST' })
  await f.request(`${pp}/category-candidates/${candidate.id}/elimination`, { token: b, method: 'PUT' })
  const received = await readUntil('category.eliminated')
  assert.ok(!received.includes('category.viewed')); assert.ok(!/eliminators|eliminatedByMe|displayName|targetCode/.test(received))
  const cursor = [...received.matchAll(/^id: (.+)$/gm)].at(-1)[1]
  controller.abort(); await reader.cancel().catch(() => {})
  await f.request(`${pp}/category-candidates/${candidate.id}/elimination`, { token: b, method: 'DELETE' })
  const replayController = new AbortController()
  const replay = await fetch(`${f.base}/v1${pp}/events`, { headers: { Authorization: `Bearer ${a}`, 'Last-Event-ID': cursor }, signal: replayController.signal })
  assert.equal(replay.status, 200); const replayReader = replay.body.getReader()
  let replayText = ''; for (let i = 0; i < 10 && !replayText.includes('category.restored'); i++) replayText += decoder.decode((await replayReader.read()).value)
  assert.ok(replayText.includes('category.restored')); replayController.abort(); await replayReader.cancel().catch(() => {})
  const expired = await fetch(`${f.base}/v1${pp}/events`, { headers: { Authorization: `Bearer ${a}`, 'Last-Event-ID': 'expired-event' } }); assert.equal(expired.status, 409)
})

test('local production credentials are provisioned server-side, hashed, single-use and role-safe', async t => {
  const f = createApp({ localAuth: true }), server = f.app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r))
  t.after(async () => { f.close(); server.closeAllConnections(); await new Promise(r => server.close(r)) })
  const origin = `http://127.0.0.1:${server.address().port}`, password = 'test-only-password-123'
  provisionAccount(f.store, { email: 'owner@example.com', displayName: '매장주', password, merchant: true })
  const credentials = f.store.all('credential')[0]; assert.ok(!JSON.stringify(credentials).includes(password))
  const code = async body => { const r = await fetch(`${origin}/api/v1/auth/local-codes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, value: await r.json() } }
  const body = { email: 'owner@example.com', password, redirectUri: 'http://localhost:5173/' }
  assert.equal((await code({ ...body, password: 'wrong' })).status, 401)
  assert.equal((await code({ ...body, role: 'MERCHANT' })).status, 422)
  assert.equal((await code({ ...body, redirectUri: 'https://attacker.example/' })).status, 422)
  const issued = await code(body); assert.equal(issued.status, 200)
  const exchange = async redirectUri => { const r = await fetch(`${origin}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'local', authorizationCode: issued.value.authorizationCode, redirectUri }) }); return { status: r.status, value: await r.json() } }
  assert.equal((await exchange('https://attacker.example/')).status, 401)
  const tokens = await exchange(body.redirectUri); assert.equal(tokens.status, 200); assert.deepEqual(tokens.value.user.roles, ['USER', 'MERCHANT'])
  assert.equal((await exchange(body.redirectUri)).status, 401)
  assert.equal((await fetch(`${origin}/api/dev/login-codes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName: 'attacker', merchant: true, redirectUri: body.redirectUri }) })).status, 404)
})

test('all eliminated candidates cannot finalize; conservative dietary filtering and private guest snapshot cleanup', async t => {
  const f = await fixture(t), a = (await f.login('방장')).accessToken
  let p = await f.request('/parties', { token: a, method: 'POST', body: { ...partyBody, budgetPerPerson: 8000 }, status: 201 }), pp = `/parties/${p.id}`
  await f.request(`${pp}/members/me/dietary-confirmation`, { token: a, method: 'PUT', body: { confirmed: true, restrictionRevision: 1 } })
  let job = await f.request(`${pp}/category-candidates/generate`, { token: a, method: 'POST', status: 202 }); await pollJob(f.request, job, a)
  const candidate = (await f.request(`${pp}/category-candidates`, { token: a })).items[0]
  await f.request(`${pp}/category-candidates/${candidate.id}/view`, { token: a, method: 'POST' })
  await f.request(`${pp}/category-candidates/${candidate.id}/elimination`, { token: a, method: 'PUT' })
  await f.request(`${pp}/category-review/complete`, { token: a, method: 'POST' })
  p = await f.request(pp, { token: a })
  assert.equal((await f.request(`${pp}/category-review/finalize`, { token: a, method: 'POST', version: p.version, status: 409 })).error.code, 'NO_ACTIVE_CANDIDATES')
  await f.request(`${pp}/category-review/complete`, { token: a, method: 'DELETE' })
  assert.equal((await f.request(`${pp}/category-candidates/${candidate.id}/elimination`, { token: a, method: 'DELETE' })).status, 'ACTIVE')

  p = await f.request('/parties', { token: a, method: 'POST', body: partyBody, status: 201 }); pp = `/parties/${p.id}`
  const invite = await f.request(`${pp}/invite-links`, { token: a, method: 'POST', body: {}, status: 201 })
  const guest = await f.request('/guest-sessions', { method: 'POST', body: { inviteToken: invite.inviteToken, displayName: '제한 게스트', deviceId: 'test' }, status: 201 }), b = guest.guestToken
  const r = await f.request('/me/dietary-restrictions', { token: b, method: 'POST', version: 1, body: { type: 'RELIGIOUS', targetCode: 'BEEF', label: '소고기', severity: 'HARD_BLOCK' }, status: 201 })
  for (const [token, revision] of [[a, 1], [b, r.revision]]) await f.request(`${pp}/members/me/dietary-confirmation`, { token, method: 'PUT', body: { confirmed: true, restrictionRevision: revision } })
  job = await f.request(`${pp}/category-candidates/generate`, { token: a, method: 'POST', status: 202 }); await pollJob(f.request, job, a)
  const candidates = await f.request(`${pp}/category-candidates`, { token: b })
  assert.ok(candidates.items.every(c => c.category.id !== 'bibimbap'))
  assert.ok(f.service.partyRestrictions(p.id).some(r => r.ownerUserId === guest.guestUser.id))
  await f.request('/me/dietary-restrictions', { token: b, method: 'PUT', version: r.revision, body: { items: [] } })
  p = await f.request(pp, { token: a }); await f.request(pp, { token: a, method: 'DELETE', version: p.version, status: 204 })
  assert.ok(!f.service.partyRestrictions(p.id).some(r => r.ownerUserId === guest.guestUser.id))
  assert.ok(!f.store.all('idempotency').some(c => c.principalId === guest.guestUser.id))
})

test('simultaneous merchant confirm/reject commits only one terminal state and at most one fee', async t => {
  const f = await fixture(t), m = (await f.login('사장님', true)).accessToken
  const r = (await f.request('/merchant/restaurants', { token: m })).items[0], qr = await f.request(`/merchant/restaurants/${r.id}/qr-codes`, { token: m, method: 'POST', status: 201 })
  const guest = await f.request(`/store-qr/${qr.qrToken}/guest-order-sessions`, { method: 'POST', body: { displayName: '손님', deviceId: 'test' }, status: 201 }), token = guest.guestToken
  const op = `/orders/${guest.order.id}`, menu = (await f.request(`${op}/menus`, { token })).items.find(m => m.salesStatus === 'AVAILABLE')
  let o = await f.request(`${op}/my-items`, { token, method: 'POST', body: item(menu.id), version: guest.order.version, status: 201 })
  o = await f.request(`${op}/members/me/complete`, { token, method: 'POST', version: o.version }); o = await f.request(`${op}/submit`, { token, method: 'POST', version: o.version })
  const results = await Promise.all(['confirm', 'reject'].map(action => fetch(`${f.base}/v1/merchant/orders/${o.id}/${action}`, { method: 'POST', headers: { Authorization: `Bearer ${m}`, 'If-Match': `"${o.version}"`, 'Idempotency-Key': crypto.randomUUID(), ...(action === 'reject' ? { 'Content-Type': 'application/json' } : {}) }, body: action === 'reject' ? JSON.stringify({ reasonCode: 'OTHER', message: '동시 처리 검증' }) : undefined })))
  assert.equal(results.filter(r => r.status === 200).length, 1); assert.equal(results.filter(r => [409, 412].includes(r.status)).length, 1)
  const final = await f.request(`/merchant/orders/${o.id}`, { token: m }), fees = (await f.request('/merchant/commissions', { token: m })).items
  assert.equal(fees.length, final.status === 'CONFIRMED' ? 1 : 0)
})
