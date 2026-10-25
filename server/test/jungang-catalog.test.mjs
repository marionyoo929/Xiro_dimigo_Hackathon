import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createApp } from '../app.mjs'
import { distance } from '../common.mjs'
import { readDemoCatalog, validateDemoCatalog } from '../seed.mjs'

test('verified Jungang catalog keeps public contracts through two-person review and ordering', async t => {
  const catalog = validateDemoCatalog(readDemoCatalog())
  const coordinates = JSON.parse(readFileSync(new URL('../catalog-coordinates.json', import.meta.url), 'utf8'))
  const station = coordinates.points.find(point => point.kind === 'STATION_ENTRANCE').location
  assert.equal(catalog.restaurants.length, 7)
  assert.ok(catalog.restaurants.every(r => distance(station, r.location) <= 1000))
  assert.ok(catalog.restaurants.every(r => catalog.menus.some(menu => menu.restaurantId === r.id)))
  assert.ok(catalog.menus.every(menu => menu.source?.url && menu.informationStatus === 'INCOMPLETE'))
  const instance = createApp({ demo: true, rateLimit: 10000 })
  const server = instance.app.listen(0, '0.0.0.0'); await new Promise(resolve => server.once('listening', resolve))
  t.after(async () => { instance.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) })
  const origin = `http://127.0.0.1:${server.address().port}`
  async function request(path, { token, method = 'GET', body, version, status = 200 } = {}) {
    const response = await fetch(`${origin}/api${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(method === 'GET' ? {} : { 'Idempotency-Key': crypto.randomUUID() }), ...(version === undefined ? {} : { 'If-Match': `"${version}"` }) }, body: body === undefined ? undefined : JSON.stringify(body) })
    const value = response.status === 204 ? null : await response.json()
    assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(value)}`)
    return value
  }
  const login = async (name, merchant = false) => {
    const issued = await request('/dev/login-codes', { method: 'POST', body: { displayName: name, merchant, redirectUri: 'http://localhost:5173/' } })
    return (await request('/v1/auth/login', { method: 'POST', body: { provider: 'demo', authorizationCode: issued.authorizationCode, redirectUri: 'http://localhost:5173/' } })).accessToken
  }
  const a = await login('중앙역 방장'), b = await login('중앙역 친구'), merchant = await login('시연 사장님', true)
  const restaurants = (await request('/v1/merchant/restaurants?limit=100', { token: merchant })).items
  assert.equal(restaurants.length, 7)
  assert.ok(restaurants.every(r => !('source' in r) && !('imageUrl' in r) && !('locationCorrection' in r)))
  let menuCount = 0
  for (const r of restaurants) {
    const menus = (await request(`/v1/merchant/restaurants/${r.id}/menus?limit=100`, { token: merchant })).items
    menuCount += menus.length
    assert.ok(menus.every(menu => !('source' in menu) && !('catalogRetired' in menu)))
  }
  assert.equal(menuCount, catalog.menus.length)
  assert.equal((await request(`/v1/restaurants/nearby-count?latitude=${station.latitude}&longitude=${station.longitude}&searchRadiusMeters=1000`, { token: a })).count, 7)
  let party = await request('/v1/parties', { token: a, method: 'POST', body: { title: '중앙역 실제 메뉴 검증', location: { ...station, address: '중앙역 1번출구' }, searchRadiusMeters: 1000, budgetPerPerson: null, mealStyle: 'INDIVIDUAL_ORDER' }, status: 201 })
  const base = `/v1/parties/${party.id}`
  const invite = await request(`${base}/invite-links`, { token: a, method: 'POST', body: {}, status: 201 })
  await request(`/v1/party-invites/${invite.inviteToken}/join`, { token: b, method: 'POST' })
  for (const token of [a, b]) await request(`${base}/members/me/dietary-confirmation`, { token, method: 'PUT', body: { confirmed: true, restrictionRevision: 1 } })
  const generate = async kind => {
    const job = await request(`${base}/${kind}-candidates/generate`, { token: a, method: 'POST', status: 202 })
    for (let i = 0; i < 100; i++) {
      const status = await request(`/v1/jobs/${job.id}`, { token: a })
      if (status.status === 'SUCCEEDED') return
      assert.ok(!['FAILED', 'CANCELED'].includes(status.status), JSON.stringify(status))
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    assert.fail('candidate generation did not finish')
  }
  const review = async kind => {
    const candidates = (await request(`${base}/${kind}-candidates?limit=100`, { token: a })).items
    for (const token of [a, b]) {
      for (const c of candidates) await request(`${base}/${kind}-candidates/${c.id}/view`, { token, method: 'POST' })
      const progress = await request(`${base}/${kind}-review/complete`, { token, method: 'POST' })
      assert.equal(progress.viewedCount, candidates.length)
    }
    party = await request(base, { token: a })
    party = await request(`${base}/${kind}-review/finalize`, { token: a, method: 'POST', version: party.version })
    return candidates
  }
  await generate('category')
  const categories = await review('category')
  assert.ok(categories.every(c => !('source' in c.category)))
  assert.ok(categories.every(c => catalog.categories.some(category => category.id === c.category.id && category.name === c.category.name)))
  await generate('restaurant')
  const candidates = await review('restaurant')
  assert.equal(candidates.length, 7)
  for (const c of candidates) assert.equal(c.restaurant.imageUrl, catalog.restaurants.find(r => r.id === c.restaurant.id).imageUrl || null)
  const selected = candidates[0]
  const detailMenus = (await request(`${base}/restaurant-candidates/${selected.id}/menus?limit=100`, { token: a })).items
  assert.ok(detailMenus.length > 0)
  party = await request(`${base}/selected-restaurant`, { token: a, method: 'PUT', version: party.version, body: { restaurantCandidateId: selected.id } })
  const qr = await request(`/v1/merchant/restaurants/${selected.restaurant.id}/qr-codes`, { token: merchant, method: 'POST', status: 201 })
  const connected = await request(`${base}/store-connection`, { token: a, method: 'POST', version: party.version, body: { qrToken: qr.qrToken } })
  let order = connected.order
  const orderBase = `/v1/orders/${order.id}`, menu = (await request(`${orderBase}/menus?limit=100`, { token: a })).items.find(m => m.salesStatus === 'AVAILABLE')
  for (const token of [a, b]) {
    order = await request(`${orderBase}/my-items`, { token, method: 'POST', version: order.version, status: 201, body: { menuId: menu.id, quantity: 1, options: [], request: '' } })
    order = await request(`${orderBase}/members/me/complete`, { token, method: 'POST', version: order.version })
  }
  order = await request(`${orderBase}/submit`, { token: a, method: 'POST', version: order.version })
  const confirmed = await request(`/v1/merchant/orders/${order.id}/confirm`, { token: merchant, method: 'POST', version: order.version })
  assert.equal(confirmed.order.status, 'CONFIRMED')
  assert.equal(confirmed.order.totalAmount, menu.price * 2)
})
