import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createApp } from '../app.mjs'
import { merchantStats, snapshotOrderAudience, snapshotCategoryReview } from '../customer-stats.mjs'
import { seedStatistics } from '../demo-stats.mjs'
import { Service } from '../service.mjs'
import { seed } from '../seed.mjs'
import YAML from 'yaml'
import Ajv from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const demoCatalog = JSON.parse(readFileSync(new URL('./fixtures/catalog.json', import.meta.url), 'utf8'))
const extensions = YAML.parse(readFileSync(new URL('../../docs/api-extensions.yaml', import.meta.url), 'utf8'))
const ajv = new Ajv({ strict: false, allErrors: true }); addFormats(ajv)
const profileContract = ajv.compile({ components: extensions.components, ...extensions.components.schemas.ProfileResponse })
const statsContract = ajv.compile({ components: extensions.components, ...extensions.components.schemas.RestaurantStats })
async function fixture(t) {
  const instance = createApp({ demo: true, demoCatalog, rateLimit: 10000 })
  const server = instance.app.listen(0, '0.0.0.0'); await new Promise(r => server.once('listening', r))
  t.after(async () => { instance.close(); server.closeAllConnections(); await new Promise(r => server.close(r)) })
  const request = async (path, token, method = 'GET', body, version, status = 200) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), ...(version ? { 'If-Match': `"${version}"` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    const data = await response.json(); assert.equal(response.status, status, JSON.stringify(data))
    const validate = status === 200 ? path === '/me/profile' ? profileContract : path.includes('/stats') ? statsContract : null : null
    if (validate) assert.ok(validate(data), JSON.stringify(validate.errors))
    return data
  }
  const login = (id, roles = ['USER']) => {
    const user = instance.service.put('user', { id, displayName: id, principalType: 'USER', roles })
    return instance.service.tokens(user).accessToken
  }
  return { ...instance, request, login }
}

test('profile is private, validated, editable and isolated to the authenticated customer', async t => {
  const f = await fixture(t), a = f.login('customer-a'), b = f.login('customer-b')
  await f.request('/me/profile', undefined, 'GET', undefined, undefined, 401)
  assert.deepEqual(await f.request('/me/profile', a), { profile: null })
  for (const body of [{ age: 0, gender: 'MALE' }, { age: 121, gender: 'MALE' }, { age: 18.5, gender: 'FEMALE' }, { age: '18', gender: 'FEMALE' }, { age: 18 }, { age: 18, gender: 'INVALID' }, { age: 18, gender: 'MALE', userId: 'customer-b' }]) await f.request('/me/profile', a, 'PUT', body, undefined, 422)
  await f.request('/me/profile', a, 'PUT', { age: 18, gender: 'FEMALE' })
  assert.equal((await f.request('/me/profile', a)).profile.age, 18)
  assert.deepEqual(await f.request('/me/profile', b), { profile: null })
  const me = await f.request('/me', a)
  assert.deepEqual(Object.keys(me).sort(), ['displayName', 'id', 'principalType', 'roles'])
  await f.request('/me/profile', a, 'PUT', { age: 19, gender: 'UNDISCLOSED' })
  assert.equal((await f.request('/me/profile', a)).profile.gender, 'UNDISCLOSED')
})

test('real QR orders produce immutable anonymous audience and menu totals, scoped to the store owner', async t => {
  const f = await fixture(t), merchant = f.login('demo-merchant', ['MERCHANT']), outsider = f.login('other-merchant', ['MERCHANT']), customer = f.login('not-merchant')
  const restaurant = f.store.all('restaurant')[0], menu = f.store.all('menu').find(m => m.restaurantId === restaurant.id && m.salesStatus === 'AVAILABLE')
  const path = `/merchant/restaurants/${restaurant.id}/stats`
  await f.request(path, customer, 'GET', undefined, undefined, 403)
  await f.request(path, outsider, 'GET', undefined, undefined, 404)
  for (const query of ['days=90', 'days=0', 'days=3&days=7', 'days=3&userId=x']) await f.request(`${path}?${query}`, merchant, 'GET', undefined, undefined, 422)
  const qr = await f.request(`/merchant/restaurants/${restaurant.id}/qr-codes`, merchant, 'POST', undefined, undefined, 201)
  for (const [age, gender, quantity] of [[18, 'FEMALE', 3], [32, 'MALE', 2]]) {
    const session = await f.request(`/store-qr/${qr.qrToken}/guest-order-sessions`, undefined, 'POST', { displayName: '손님', deviceId: crypto.randomUUID() }, undefined, 201)
    const token = session.guestToken, base = `/orders/${session.order.id}`
    await f.request('/me/profile', token, 'PUT', { age, gender })
    let order = await f.request(`${base}/my-items`, token, 'POST', { menuId: menu.id, quantity, options: [], request: '' }, session.order.version, 201)
    order = await f.request(`${base}/members/me/complete`, token, 'POST', undefined, order.version)
    order = await f.request(`${base}/submit`, token, 'POST', undefined, order.version)
    await f.request('/me/profile', token, 'PUT', { age: 65, gender: 'OTHER' })
    await f.request(`/merchant/orders/${order.id}/confirm`, merchant, 'POST', undefined, order.version)
    assert.equal(f.store.get('customer-profile', session.guestUser.id), null, 'terminal guest profile is removed')
    assert.equal(JSON.stringify(f.store.get('order-audience', order.id)).includes(session.guestUser.id), false)
  }
  for (const days of [3, 7, 30]) {
    const result = await f.request(`${path}?days=${days}`, merchant)
    assert.equal(result.daily.length, days)
    assert.equal(result.summary.confirmedOrders, 2)
    assert.equal(result.summary.participants, 2)
    assert.equal(result.popularMenus[0].quantity, 5)
    assert.equal(result.summary.confirmedAmount, menu.price * 5)
    assert.equal(result.ageGroups.find(row => row.label === '10대').count, 1)
    assert.equal(result.ageGroups.find(row => row.label === '30대').count, 1)
    assert.equal(result.genders.find(row => row.label === '여성').count, 1)
    assert.equal(result.genders.find(row => row.label === '남성').count, 1)
    assert.equal(JSON.stringify(result).includes('displayName'), false)
    assert.equal(JSON.stringify(result).includes('userId'), false)
  }
})

test('periods use Korean calendar boundaries; drafts, rejected menus and other stores do not affect rankings', async t => {
  const f = await fixture(t), timestamp = Date.parse('2026-10-25T05:00:00Z')
  const add = (id, date, status, quantity = 1, restaurantId = 'store-a') => f.service.put('order', { id, restaurantId, status, submittedAt: date, totalAmount: quantity * 10000, members: [{ userId: `private-${id}`, items: [{ menuId: 'menu-a', menuName: '아부라소바', quantity, lineAmount: quantity * 10000 }] }] })
  add('boundary', '2026-10-22T15:00:00Z', 'CONFIRMED', 2)
  add('before-boundary', '2026-10-22T14:59:59Z', 'CONFIRMED', 3)
  add('today', '2026-10-25T14:59:59Z', 'CONFIRMED')
  add('tomorrow', '2026-10-25T15:00:00Z', 'CONFIRMED', 100)
  add('rejected', '2026-10-24T00:00:00Z', 'REJECTED', 100)
  add('draft', null, 'DRAFT', 100)
  add('foreign', '2026-10-24T00:00:00Z', 'CONFIRMED', 100, 'store-b')
  const short = merchantStats(f.service, 'store-a', 3, timestamp), week = merchantStats(f.service, 'store-a', 7, timestamp)
  assert.equal(short.from, '2026-10-22T15:00:00.000Z')
  assert.equal(short.summary.orders, 3)
  assert.equal(short.summary.confirmedOrders, 2)
  assert.equal(short.summary.rejectedOrders, 1)
  assert.equal(short.summary.confirmedAmount, 30000)
  assert.equal(short.popularMenus[0].quantity, 3)
  assert.equal(short.ageGroups.find(row => row.label === '미입력').count, 2)
  assert.equal(short.daily[0].orders, 1)
  assert.equal(week.popularMenus[0].quantity, 6)
})

test('market ranks merge categories across stores and alternatives count only finalized reviews where our categories were eliminated', async t => {
  const f = await fixture(t), at = Date.parse('2026-10-25T05:00:00Z'), submittedAt = '2026-10-24T00:00:00Z'
  for (const [id, name] of [['abura', '아부라소바'], ['test-pasta', '파스타'], ['test-salad', '샐러드']]) f.service.put('category', { id, name })
  for (const [id, restaurantId, categoryId] of [['our-spicy-menu', 'our-store', 'abura'], ['other-spicy-menu', 'private-other-store', 'abura'], ['other-pasta-menu', 'private-other-store', 'test-pasta']]) f.service.put('menu', { id, restaurantId, categoryId, salesStatus: 'AVAILABLE' })
  const order = (id, restaurantId, menuId, quantity, status = 'CONFIRMED') => {
    const value = { id, restaurantId, submittedAt, status, totalAmount: quantity * 10000, members: [{ userId: 'private-customer', items: [{ menuId, menuName: 'private-specific-menu-name', quantity, lineAmount: quantity * 10000 }] }] }
    f.service.put('order', value); snapshotOrderAudience(f.service, value)
  }
  order('our-sale', 'our-store', 'our-spicy-menu', 2)
  order('their-sale', 'private-other-store', 'other-spicy-menu', 4)
  order('their-pasta', 'private-other-store', 'other-pasta-menu', 7)
  order('rejected-sale', 'private-other-store', 'other-spicy-menu', 100, 'REJECTED')
  f.service.put('menu', { ...f.service.get('menu', 'other-spicy-menu'), categoryId: 'test-pasta' })
  const candidate = (categoryId, eliminated = false) => ({ id: `candidate-${categoryId}`, category: { id: categoryId, name: f.service.get('category', categoryId).name }, eliminators: eliminated ? ['private-member'] : [] })
  for (const [id, items] of [
    ['first-review', [candidate('abura', true), candidate('test-pasta'), candidate('test-salad')]],
    ['second-review', [candidate('abura', true), candidate('test-pasta')]],
    ['irrelevant-review', [candidate('test-pasta', true), candidate('abura')]],
  ]) snapshotCategoryReview(f.service, { id, items }, submittedAt)
  snapshotCategoryReview(f.service, { id: 'old-review', items: [candidate('abura', true), candidate('test-salad')] }, '2026-10-01T00:00:00Z')
  f.service.put('party', { id: 'unfinished-private-party', sets: [{ id: 'unfinished', kind: 'CATEGORY', finalized: false, items: [candidate('abura', true), candidate('test-salad')] }] })
  const result = merchantStats(f.service, 'our-store', 3, at), market = result.market
  assert.deepEqual(market.popularCategories.slice(0, 2).map(row => [row.name, row.quantity, row.orderCount]), [['파스타', 7, 1], ['아부라소바', 6, 2]])
  assert.equal(result.summary.confirmedOrders, 1, 'our store metrics stay private to our store')
  assert.equal(market.categoryInsights.finalizedReviews, 3)
  assert.equal(market.categoryInsights.excludedReviews, 2)
  assert.deepEqual(market.categoryInsights.survivingAlternatives.map(row => [row.name, row.partyCount, row.sharePercent]), [['파스타', 2, 100], ['샐러드', 1, 50]])
  const publicMarket = JSON.stringify(market)
  for (const privateText of ['private-other-store', 'private-customer', 'private-member', 'private-specific-menu-name', 'unfinished-private-party']) assert.equal(publicMarket.includes(privateText), false)
})

test('large analytics fixtures preserve real resources, repeat safely and are ignored outside demo mode', async t => {
  const f = await fixture(t), at = Date.parse('2026-10-25T05:00:00Z')
  const customer = f.login('real-customer')
  await f.request('/me/profile', customer, 'PUT', { age: 18, gender: 'FEMALE' })
  const before = Object.fromEntries(['order', 'party', 'restaurant', 'menu', 'user', 'customer-profile', 'commission'].map(kind => [kind, f.store.all(kind)]))
  const result = f.store.transaction(() => seedStatistics(f.service, at))
  assert.ok(result.orders > 500)
  assert.ok(result.categoryReviews > 300)
  const restaurantId = f.store.all('restaurant')[0].id
  const three = merchantStats(f.service, restaurantId, 3, at), week = merchantStats(f.service, restaurantId, 7, at), month = merchantStats(f.service, restaurantId, 30, at)
  assert.ok(three.summary.confirmedOrders > 0)
  assert.ok(week.summary.confirmedOrders > three.summary.confirmedOrders)
  assert.ok(month.summary.confirmedOrders > week.summary.confirmedOrders)
  assert.ok(three.market.categoryInsights.survivingAlternatives.length > 0)
  const again = f.store.transaction(() => seedStatistics(f.service, at))
  assert.deepEqual(result, again)
  assert.deepEqual(merchantStats(f.service, restaurantId, 3, at), three)
  for (const [kind, rows] of Object.entries(before)) assert.deepEqual(f.store.all(kind), rows, kind)
  assert.equal(merchantStats(new Service(f.store, { demo: false }), restaurantId, 30, at).summary.orders, 0)
  assert.equal(merchantStats(new Service(f.store, { demo: false }), restaurantId, 30, at).market.popularCategories.length, 0)
})

test('a fresh demo installs the release catalog and analytics without sharing runtime credentials or overwriting later edits', t => {
  const instance = createApp({ demo: true })
  t.after(() => instance.close())
  const restaurants = instance.store.all('restaurant')
  assert.equal(restaurants.length, 7)
  assert.equal(instance.store.all('menu').length, 90)
  assert.ok(instance.store.all('demo-stats-order').length > 500)
  assert.ok(instance.store.all('demo-stats-review').length > 300)
  assert.equal(instance.store.all('session').length, 0)
  assert.equal(instance.store.all('idempotency').length, 0)
  assert.equal(instance.store.all('customer-profile').length, 0)
  assert.equal(instance.store.all('user').length, 1)
  instance.service.put('restaurant', { ...restaurants[0], phone: '010-1234-5678' })
  const before = instance.store.all('demo-stats-order')
  instance.store.transaction(() => seed(instance.service))
  assert.deepEqual(instance.store.all('demo-stats-order'), before)
  assert.equal(instance.store.get('restaurant', restaurants[0].id).phone, '010-1234-5678')
})
