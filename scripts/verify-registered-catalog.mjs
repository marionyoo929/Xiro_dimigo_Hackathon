import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile(new URL('../src/lib/registeredCatalog.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
const { normalizeRadiusMeters, formatRadius, distanceMeters, nearbyRegisteredRestaurants, registeredCategoryCandidates } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
assert.equal(normalizeRadiusMeters(0), 200)
assert.equal(normalizeRadiusMeters(200), 200)
assert.equal(normalizeRadiusMeters(556), 560)
assert.equal(normalizeRadiusMeters(1000), 1000)
assert.equal(normalizeRadiusMeters(8000), 1000)
assert.equal(normalizeRadiusMeters(NaN), 1000)
assert.equal(formatRadius(200), '200m')
assert.equal(formatRadius(1000), '1km')

const origin = { latitude: 0, longitude: 0 }
const atDistance = meters => ({ latitude: meters / 6371000 * 180 / Math.PI, longitude: 0 })
assert.equal(distanceMeters(origin, origin), 0)
assert.ok(Math.abs(distanceMeters(origin, atDistance(200)) - 200) < 0.000001)
const restaurant = (id, meters) => ({ id, name: id, address: id, location: atDistance(meters) })
const menu = (id, restaurantId, price, categoryId = 'rice', salesStatus = 'AVAILABLE') => ({
  id, restaurantId, price, categoryId, salesStatus, name: id, description: id,
})
const catalog = {
  restaurants: [restaurant('a', 100), restaurant('b', 400), restaurant('c', 1001), restaurant('a', 100)],
  categories: [{ id: 'rice', name: '밥', image: 'rice.jpg', description: '밥' }, { id: 'pizza', name: '피자', image: 'pizza.jpg', description: '피자' }],
  menus: [
    menu('a1', 'a', 8000), menu('a2', 'a', 10000), menu('b1', 'b', 12000),
    menu('too-expensive', 'b', 20000), menu('outside-radius', 'c', 5000),
    menu('not-registered', 'external', 5000, 'pizza'), menu('sold-out', 'a', 5000, 'pizza', 'SOLD_OUT'),
    menu('hidden', 'a', 5000, 'pizza', 'HIDDEN'), menu('uncategorized', 'a', 5000, null),
    menu('unknown-category', 'a', 5000, 'unknown'),
  ],
}
const query = { location: origin, searchRadiusMeters: 1000, budgetPerPerson: 15000 }
assert.deepEqual(nearbyRegisteredRestaurants(catalog, { ...query, searchRadiusMeters: 200 }).map(item => item.id), ['a'])
assert.deepEqual(nearbyRegisteredRestaurants(catalog, query).map(item => item.id), ['a', 'b'])
const candidates = registeredCategoryCandidates(catalog, query)
assert.equal(candidates.length, 1)
assert.equal(candidates[0].id, 'rice')
assert.deepEqual(candidates[0].menuIds, ['a1', 'a2', 'b1'])
assert.deepEqual(candidates[0].priceRange, { min: 8000, max: 12000 })
assert.equal(candidates[0].nearbyRestaurantCount, 2)
assert.equal(registeredCategoryCandidates(catalog, { ...query, budgetPerPerson: 9000 })[0].price, '8,000원')
assert.equal(registeredCategoryCandidates(catalog, { ...query, budgetPerPerson: 1000 }).length, 0)
assert.deepEqual(registeredCategoryCandidates({ ...catalog, restaurants: [] }, query), [])
assert.deepEqual(registeredCategoryCandidates({ ...catalog, menus: [] }, query), [])
assert.equal(registeredCategoryCandidates(catalog, { ...query, budgetPerPerson: null })[0].priceRange.max, 20000)
// Check the physical boundary rather than rounded labels near the edge.
assert.equal(nearbyRegisteredRestaurants({ ...catalog, restaurants: [restaurant('inside', 199.999), restaurant('outside', 200.001)] }, { ...query, searchRadiusMeters: 200 }).length, 1)
console.log('PASS: 200–1000m radius, physical distance boundaries, registered stores only, unique counts, menu linkage, sales status, budget, price aggregation and empty results')
