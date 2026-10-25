import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createApp } from '../app.mjs'
import { legacyRestaurantIds, replaceDemoCatalog, validateDemoCatalog } from '../seed.mjs'
import { nearbyMenus, qrRestaurant } from '../catalog.mjs'
import { publicMenu, publicRestaurant } from '../common.mjs'
import { validator } from '../contract.mjs'
import { replaceCatalogFile } from '../../scripts/replace-demo-catalog.mjs'

const oldCatalog = JSON.parse(readFileSync(new URL('./fixtures/catalog.json', import.meta.url), 'utf8'))
const catalog = {
  revision: 'catalog-import-test-1',
  categories: [{ id: 'aburasoba', name: '아부라소바', imageUrl: 'https://example.com/soba.jpg', source: { url: 'https://example.com/menu' } }],
  restaurants: Array.from({ length: 5 }, (_, i) => ({ id: `jungang-test-${i}`, name: `중앙역 식당 ${i}`, address: '테스트 주소', location: { latitude: 37.315 + i * .0001, longitude: 126.838 }, source: { url: 'https://example.com/store' } })),
  menus: Array.from({ length: 5 }, (_, i) => ({ id: `jungang-menu-${i}`, restaurantId: `jungang-test-${i}`, name: '매운 아부라소바', description: '', price: 10000, categoryId: 'aburasoba', salesStatus: 'AVAILABLE', imageUrls: ['https://example.com/soba.jpg'], source: { url: 'https://example.com/menu' } })),
}

test('catalog replacement backs up committed WAL, retires only selected samples and preserves parties, orders and registered stores', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'xiro-catalog-')), dbPath = join(directory, 'state.sqlite')
  const instance = createApp({ demo: true, demoCatalog: oldCatalog, dbPath })
  t.after(() => { instance.close(); rmSync(directory, { recursive: true, force: true }) })
  const { store } = instance
  store.put('user', { id: 'kept-user', displayName: '보존 계정', roles: ['USER'], principalType: 'USER' })
  store.put('party', { id: 'kept-party', state: 'ORDERING', members: [], sets: [], selectedRestaurantId: 'demo-city-a' })
  store.put('order', { id: 'kept-order', restaurantId: 'demo-city-a', status: 'DRAFT', members: [] })
  for (let i = 0; i < 2; i++) store.put('restaurant', { id: `kept-store-${i}`, name: `기존 등록 ${i}`, address: '기존 주소', ownerId: 'kept-user', location: { latitude: 37.315, longitude: 126.838 } })
  store.put('menu', { id: 'kept-menu', restaurantId: 'kept-store-0', categoryId: 'bibimbap', deleted: false })
  const protectedBefore = ['user', 'party', 'order', 'session', 'qr', 'outbox'].map(kind => [kind, JSON.stringify(store.all(kind))])
  const result = await replaceCatalogFile({ dbPath, catalog, backupDirectory: join(directory, 'backups') })
  assert.equal(result.activeRestaurants, 7)
  assert.equal(result.retiredRestaurants, 6)
  assert.equal(result.retiredMenus, 28)
  assert.equal(result.addedRestaurants, 5)
  assert.equal(result.addedMenus, 5)
  for (const [kind, snapshot] of protectedBefore) assert.equal(JSON.stringify(store.all(kind)), snapshot, `${kind} was changed`)
  assert.equal(store.get('restaurant', 'kept-store-0').catalogRetired, undefined)
  assert.equal(store.get('menu', 'kept-menu').catalogRetired, undefined)
  assert.equal(store.get('category', 'bibimbap').catalogRetired, undefined)
  assert.equal(store.get('category', 'aburasoba').imageUrl, catalog.categories[0].imageUrl)
  assert.equal(store.get('menu', 'jungang-menu-0').informationStatus, 'INCOMPLETE')
  assert.deepEqual(store.get('menu', 'jungang-menu-0').allergenCodes, [])
  assert.deepEqual(store.get('menu', 'jungang-menu-0').imageUrls, catalog.menus[0].imageUrls)
  const oldDb = new DatabaseSync(result.backupPath, { readOnly: true })
  try {
    const oldRestaurants = oldDb.prepare('SELECT body FROM resources WHERE kind=?').all('restaurant').map(row => JSON.parse(row.body))
    assert.equal(oldRestaurants.length, 8)
    assert.ok(oldRestaurants.every(r => !r.catalogRetired))
    assert.ok(oldDb.prepare('SELECT body FROM resources WHERE kind=? AND id=?').get('user', 'kept-user'))
    assert.equal(oldDb.prepare('PRAGMA integrity_check').get().integrity_check, 'ok')
  } finally { oldDb.close() }
  assert.deepEqual(replaceDemoCatalog(instance.service, catalog), { changed: false, revision: catalog.revision })
})

test('retired samples disappear from new candidates and merchant lists, block new QR entry, and keep existing order access', t => {
  const instance = createApp({ demo: true, demoCatalog: oldCatalog })
  t.after(() => instance.close())
  const { service, store } = instance, user = store.get('user', 'demo-merchant')
  const req = { user, query: {}, path: '/merchant/restaurants', params: { restaurantId: 'demo-city-a' } }
  const qr = service.handlers.createMerchantQrCode.call(service, req)
  const guest = service.handlers.createQrGuestOrderSession.call(service, { params: { qrToken: qr.qrToken }, body: { displayName: '기존 손님' } })
  const guestUser = store.get('user', guest.guestUser.id)
  store.transaction(() => replaceDemoCatalog(service, catalog))
  assert.deepEqual(service.handlers.listMerchantRestaurants.call(service, req).items.map(r => r.id), catalog.restaurants.map(r => r.id))
  assert.deepEqual(nearbyMenus(service, { location: oldCatalog.restaurants[0].location, searchRadiusMeters: 1000, budgetPerPerson: null }).restaurants, [])
  assert.throws(() => qrRestaurant(service, qr.qrToken), error => error.code === 'QR_EXPIRED')
  assert.throws(() => service.handlers.createQrGuestOrderSession.call(service, { params: { qrToken: qr.qrToken }, body: { displayName: '새 손님' } }), error => error.code === 'QR_EXPIRED')
  assert.throws(() => service.handlers.createMerchantQrCode.call(service, req), error => error.code === 'STORE_ORDER_DISABLED')
  const orderReq = { user: guestUser, params: { orderId: guest.order.id }, query: {}, path: `/orders/${guest.order.id}/menus` }
  assert.equal(service.handlers.getOrder.call(service, orderReq).id, guest.order.id)
  assert.ok(service.handlers.listOrderMenus.call(service, orderReq).items.length > 0)
  assert.ok(!('catalogRetired' in publicRestaurant(store.get('restaurant', 'demo-city-a'))))
  assert.ok(!('source' in publicMenu(store.get('menu', 'jungang-menu-0'))))
  assert.equal(service.handlers.listFoodCategories.call(service, { ...req, path: '/food-categories' }).items.length, 1)
})

test('invalid catalog links and overlapping retire IDs cannot be applied', t => {
  const instance = createApp({ demo: true, demoCatalog: oldCatalog }); t.after(() => instance.close())
  assert.throws(() => validateDemoCatalog({ ...catalog, menus: [{ ...catalog.menus[0], restaurantId: 'missing' }] }), /메뉴/)
  assert.throws(() => replaceDemoCatalog(instance.service, catalog, { retireIds: [catalog.restaurants[0].id] }), /겹칩니다/)
  assert.equal(instance.store.all('restaurant').filter(r => !r.catalogRetired).length, legacyRestaurantIds.length)
})

test('explicit restaurant corrections change only verified contact, location and photo fields', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'xiro-catalog-correction-')), dbPath = join(directory, 'state.sqlite')
  const instance = createApp({ demo: true, demoCatalog: oldCatalog, dbPath })
  t.after(() => { instance.close(); rmSync(directory, { recursive: true, force: true }) })
  const existing = { id: 'keep-corrected', version: 4, name: '기존 식당 이름', ownerId: 'existing-owner', address: '예전 주소', location: { latitude: 37.3, longitude: 126.8 }, phone: '031-000-0000', orderEnabled: false, businessHours: [{ dayOfWeek: 1, opensAt: '09:00', closesAt: '21:00', closesNextDay: false }], createdAt: '2026-01-01T00:00:00Z' }
  const untouched = { ...existing, id: 'keep-untouched' }
  instance.store.put('restaurant', existing); instance.store.put('restaurant', untouched)
  const correction = { ...existing, version: 999, name: '덮어쓰면 안 되는 이름', ownerId: 'other-owner', businessHours: [], orderEnabled: true, createdAt: '2026-10-25T00:00:00Z', address: '확인한 주소', location: { latitude: 37.3152, longitude: 126.839 }, phone: '031-111-2222', imageUrl: 'https://example.com/restaurant.jpg', source: { url: 'https://example.com/verified-location' }, locationCorrection: { previousAddress: '예전 주소' } }
  const incoming = { ...catalog, revision: 'catalog-correction-test-1', restaurants: [...catalog.restaurants, correction, { ...correction, id: untouched.id }] }
  const result = await replaceCatalogFile({ dbPath, catalog: incoming, updateRestaurantIds: [existing.id], backupDirectory: join(directory, 'backups') })
  assert.equal(result.updatedRestaurants, 1)
  assert.equal(result.activeRestaurants, 7)
  const updated = instance.store.get('restaurant', existing.id)
  for (const key of ['name', 'ownerId', 'businessHours', 'orderEnabled', 'createdAt']) assert.deepEqual(updated[key], existing[key], key)
  for (const key of ['address', 'location', 'phone', 'imageUrl', 'source']) assert.deepEqual(updated[key], correction[key], key)
  assert.equal(updated.version, 5)
  assert.deepEqual(instance.store.get('restaurant', untouched.id), untouched)
  const validate = validator({ $ref: '#/components/schemas/Restaurant' })
  const value = publicRestaurant({ ...updated, locationCorrection: correction.locationCorrection })
  assert.ok(!('imageUrl' in value)); assert.ok(!('locationCorrection' in value)); assert.ok(!('source' in value))
  assert.ok(validate(value), JSON.stringify(validate.errors))
})

test('uncategorized extra items remain orderable without becoming food review candidates', t => {
  const instance = createApp({ demo: true, demoCatalog: oldCatalog }); t.after(() => instance.close())
  const extra = { ...catalog.menus[0], id: 'extra-item', name: '빵 추가', categoryId: null, price: 1000 }
  const incoming = { ...catalog, revision: 'uncategorized-test-1', menus: [...catalog.menus, extra] }
  assert.doesNotThrow(() => validateDemoCatalog(incoming))
  instance.store.transaction(() => replaceDemoCatalog(instance.service, incoming))
  const { service, store } = instance
  assert.ok(!nearbyMenus(service, { location: catalog.restaurants[0].location, searchRadiusMeters: 1000, budgetPerPerson: null }).menus.some(m => m.id === extra.id))
  const qr = service.handlers.createMerchantQrCode.call(service, { user: store.get('user', 'demo-merchant'), params: { restaurantId: catalog.restaurants[0].id } })
  const guest = service.handlers.createQrGuestOrderSession.call(service, { params: { qrToken: qr.qrToken }, body: { displayName: '추가 메뉴 손님' } })
  const req = { user: store.get('user', guest.guestUser.id), params: { orderId: guest.order.id }, query: {}, path: `/orders/${guest.order.id}/menus` }
  assert.ok(service.handlers.listOrderMenus.call(service, req).items.some(m => m.id === extra.id))
})

test('CLI dry run reports explicit corrections and leaves all database rows unchanged', t => {
  const directory = mkdtempSync(join(tmpdir(), 'xiro-catalog-cli-')), dbPath = join(directory, 'state.sqlite'), catalogPath = join(directory, 'catalog.json')
  const instance = createApp({ demo: true, demoCatalog: oldCatalog, dbPath })
  t.after(() => { instance.close(); rmSync(directory, { recursive: true, force: true }) })
  const existing = { ...catalog.restaurants[0], id: 'existing-correctable', version: 1, ownerId: 'original-owner' }
  instance.store.put('restaurant', existing)
  writeFileSync(catalogPath, JSON.stringify({ ...catalog, restaurants: [...catalog.restaurants, existing] }))
  const before = JSON.stringify(instance.store.db.prepare('SELECT * FROM resources ORDER BY kind,id').all())
  const script = new URL('../../scripts/replace-demo-catalog.mjs', import.meta.url)
  const result = spawnSync(process.execPath, [fileURLToPath(script), '--db', dbPath, '--catalog', catalogPath, '--retire-ids', legacyRestaurantIds.join(','), '--update-restaurant-ids', existing.id], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  const output = JSON.parse(result.stdout.slice(0, result.stdout.lastIndexOf('}') + 1))
  assert.equal(output.apply, false)
  assert.deepEqual(output.updateRestaurantIds, [existing.id])
  assert.deepEqual(output.retireIds, legacyRestaurantIds)
  assert.equal(JSON.stringify(instance.store.db.prepare('SELECT * FROM resources ORDER BY kind,id').all()), before)
})
