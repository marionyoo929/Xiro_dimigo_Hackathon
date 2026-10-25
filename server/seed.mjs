import { readFileSync } from 'node:fs'
import { now } from './common.mjs'
import { seedStatistics } from './demo-stats.mjs'

export const legacyRestaurantIds = ['demo-city-a', 'demo-city-b', 'demo-city-c', 'demo-wadong-a', 'demo-wadong-b', 'demo-wadong-c']
export const readDemoCatalog = () => JSON.parse(readFileSync(new URL('./demo-catalog.json', import.meta.url), 'utf8'))
const catalogFor = service => service.options.demoCatalog || readDemoCatalog()
export const restrictionTargets = [
  ['PEANUT', '땅콩', 'ALLERGY'], ['MILK', '우유', 'ALLERGY'], ['EGG', '달걀', 'ALLERGY'], ['WHEAT', '밀', 'ALLERGY'], ['SOY', '대두', 'ALLERGY'], ['FISH', '생선', 'ALLERGY'], ['SHELLFISH', '갑각류', 'ALLERGY'],
  ['PORK', '돼지고기', 'RELIGIOUS'], ['BEEF', '소고기', 'RELIGIOUS'], ['ANIMAL_PRODUCT', '동물성 재료', 'VEGETARIAN'], ['MEAT', '육류', 'VEGETARIAN'], ['CILANTRO', '고수', 'INGREDIENT_AVOIDANCE'],
].map(([code, label, type]) => ({ code, label, type }))
export function seedReference(service, catalog = catalogFor(service)) {
  for (const category of catalog.categories) if (!service.store.get('category', category.id)) service.put('category', categoryRecord(category, service.options.origin))
  for (const target of restrictionTargets) if (!service.store.get('ingredient', target.code)) service.put('ingredient', { id: target.code, code: target.code, name: target.label })
}
export function seed(service) {
  const catalog = catalogFor(service)
  const initialized = service.store.get('setting', 'demo-seeded')
  if (!initialized) service.put('user', { id: 'demo-merchant', displayName: '시연 사장님', principalType: 'USER', roles: ['USER', 'MERCHANT'] })
  seedReference(service)
  if (!initialized) {
    for (const r of catalog.restaurants) service.put('restaurant', restaurantRecord(r))
    for (const m of catalog.menus) service.put('menu', menuRecord(m))
    service.put('setting', { id: 'demo-seeded', version: 1 })
    if (catalog.revision) service.put('setting', { id: 'demo-catalog-revision', revision: catalog.revision })
    if (!service.options.demoCatalog) seedStatistics(service)
  }
}

const categoryRecord = (category, origin) => ({ id: category.id, code: category.id.toUpperCase(), name: category.name, imageUrl: category.imageUrl || (category.image ? new URL(`/images/${encodeURIComponent(category.image)}`, origin).href : null), ...(category.source ? { source: category.source } : {}) })
const restaurantRecord = r => ({ version: 1, ownerId: 'demo-merchant', businessHours: [], orderEnabled: true, createdAt: now(), ...r, phone: r.phone?.trim() || '정보 미등록' })
function menuRecord(m) {
  const metadata = {
    bibimbap: ['BEEF', 'SOY', 'MEAT', 'ANIMAL_PRODUCT'], noodles: ['WHEAT', 'FISH', 'ANIMAL_PRODUCT'], tonkatsu: ['PORK', 'WHEAT', 'EGG', 'MEAT', 'ANIMAL_PRODUCT'],
    'bibimbap-b': ['SOY'], pasta: ['WHEAT', 'MILK', 'ANIMAL_PRODUCT'], salad: [], soldout: ['FISH', 'ANIMAL_PRODUCT'], hidden: ['WHEAT', 'MILK', 'ANIMAL_PRODUCT'],
    spicy: ['WHEAT', 'SOY', 'EGG', 'PORK', 'MEAT', 'ANIMAL_PRODUCT'], stew: ['PORK', 'MEAT', 'ANIMAL_PRODUCT'], sushi: ['FISH', 'ANIMAL_PRODUCT'],
    burger: ['BEEF', 'WHEAT', 'MEAT', 'ANIMAL_PRODUCT'], rice: ['EGG', 'SOY', 'ANIMAL_PRODUCT'], pizza: ['WHEAT', 'MILK', 'ANIMAL_PRODUCT'],
  }
  const code = m.id.replace(/^demo-(city|wadong)-/, ''), legacy = /^demo-(city|wadong)-/.test(m.id), codes = legacy ? metadata[code] || [] : []
  return { version: 1, description: '', ingredientIds: codes, allergenCodes: codes.filter(c => restrictionTargets.some(t => t.code === c && t.type === 'ALLERGY')), restrictionTargetCodes: codes,
    // Public map menus do not prove the ingredients or allergens. Only the old
    // automated-test fixture carries assumed complete ingredient metadata.
    informationStatus: legacy ? 'COMPLETE' : 'INCOMPLETE', imageUrls: [], isRepresentative: true, options: [], salesStatus: 'AVAILABLE', deleted: false, ...m }
}

export function validateDemoCatalog(catalog) {
  if (!catalog || !Array.isArray(catalog.categories) || !Array.isArray(catalog.restaurants) || !Array.isArray(catalog.menus)) throw new Error('카탈로그 categories/restaurants/menus 목록이 필요합니다.')
  const ids = list => {
    const values = new Set()
    for (const item of list) { if (typeof item.id !== 'string' || !item.id || values.has(item.id)) throw new Error('카탈로그 ID가 비어 있거나 중복되었습니다.'); values.add(item.id) }
    return values
  }
  const categories = ids(catalog.categories), restaurants = ids(catalog.restaurants); ids(catalog.menus)
  for (const category of catalog.categories) if (!category.name?.trim()) throw new Error('카테고리 이름이 필요합니다.')
  for (const r of catalog.restaurants) if (!r.name?.trim() || !r.address?.trim() || !Number.isFinite(r.location?.latitude) || Math.abs(r.location.latitude) > 90 || !Number.isFinite(r.location?.longitude) || Math.abs(r.location.longitude) > 180) throw new Error(`식당 위치와 이름을 확인하세요: ${r.id}`)
  for (const m of catalog.menus) if (!restaurants.has(m.restaurantId) || m.categoryId !== null && !categories.has(m.categoryId) || !m.name?.trim() || !Number.isSafeInteger(m.price) || m.price < 0 || !['AVAILABLE', 'SOLD_OUT', 'HIDDEN'].includes(m.salesStatus || 'AVAILABLE')) throw new Error(`메뉴 정보와 연결을 확인하세요: ${m.id}`)
  return catalog
}

// Run inside the caller's transaction, after taking a SQLite-consistent backup.
// Retired records stay addressable by existing parties, orders and settlement
// history, but are excluded from newly generated catalog results and QR entry.
export function replaceDemoCatalog(service, catalog, { retireIds = legacyRestaurantIds, updateRestaurantIds = [] } = {}) {
  validateDemoCatalog(catalog)
  if (!catalog.revision || typeof catalog.revision !== 'string') throw new Error('교체 카탈로그 revision이 필요합니다.')
  const previous = service.store.get('setting', 'demo-catalog-revision')
  if (previous?.revision === catalog.revision) return { changed: false, revision: catalog.revision }
  if (!Array.isArray(retireIds) || retireIds.some(value => typeof value !== 'string' || !value)) throw new Error('은퇴시킬 식당 ID 목록을 확인하세요.')
  if (!Array.isArray(updateRestaurantIds) || updateRestaurantIds.some(value => typeof value !== 'string' || !value)) throw new Error('보정할 식당 ID 목록을 확인하세요.')
  const retiredIds = new Set(retireIds), categoryIds = new Set(catalog.categories.map(c => c.id))
  if (catalog.restaurants.some(r => retiredIds.has(r.id))) throw new Error('추가할 식당 ID와 은퇴시킬 식당 ID가 겹칩니다.')
  const updateIds = new Set(updateRestaurantIds)
  if ([...updateIds].some(id => retiredIds.has(id) || !service.store.get('restaurant', id) || !catalog.restaurants.some(r => r.id === id))) throw new Error('보정할 식당은 기존 DB와 입력 카탈로그 양쪽에 존재해야 하며 은퇴 목록과 겹칠 수 없습니다.')
  let retiredRestaurants = 0, retiredMenus = 0
  for (const r of service.store.all('restaurant')) if (retiredIds.has(r.id) && !r.catalogRetired) { service.put('restaurant', { ...r, catalogRetired: true }); retiredRestaurants++ }
  for (const m of service.store.all('menu')) if (retiredIds.has(m.restaurantId) && !m.catalogRetired) { service.put('menu', { ...m, catalogRetired: true }); retiredMenus++ }
  const oldCategoryIds = new Set(service.store.all('menu').filter(m => retiredIds.has(m.restaurantId)).map(m => m.categoryId))
  for (const c of service.store.all('category')) if (oldCategoryIds.has(c.id) && !categoryIds.has(c.id) && !service.store.all('menu').some(m => !m.catalogRetired && !m.deleted && m.categoryId === c.id)) service.put('category', { ...c, catalogRetired: true })
  for (const c of catalog.categories) service.put('category', { ...service.store.get('category', c.id), ...categoryRecord(c, service.options.origin), catalogRetired: false })
  if (!service.store.get('user', 'demo-merchant')) service.put('user', { id: 'demo-merchant', displayName: '시연 사장님', principalType: 'USER', roles: ['USER', 'MERCHANT'] })
  let addedRestaurants = 0, addedMenus = 0, updatedRestaurants = 0
  for (const r of catalog.restaurants) {
    const existing = service.store.get('restaurant', r.id)
    if (!existing) { service.put('restaurant', restaurantRecord(r)); addedRestaurants++ }
    else if (updateIds.has(r.id)) {
      const fields = Object.fromEntries(['address', 'location', 'phone', 'imageUrl', 'source'].filter(key => Object.hasOwn(r, key)).map(key => [key, r[key]]))
      if (Object.hasOwn(fields, 'phone')) fields.phone = fields.phone?.trim() || '정보 미등록'
      if (Object.entries(fields).some(([key, value]) => JSON.stringify(existing[key]) !== JSON.stringify(value))) {
        service.put('restaurant', { ...existing, ...fields, version: existing.version + 1 })
        updatedRestaurants++
      }
    }
  }
  for (const m of catalog.menus) if (!service.store.get('menu', m.id)) { service.put('menu', menuRecord(m)); addedMenus++ }
  service.put('setting', { id: 'demo-seeded', version: 1 })
  service.put('setting', { id: 'demo-catalog-revision', revision: catalog.revision })
  return { changed: true, revision: catalog.revision, retiredRestaurants, retiredMenus, addedRestaurants, updatedRestaurants, addedMenus }
}
