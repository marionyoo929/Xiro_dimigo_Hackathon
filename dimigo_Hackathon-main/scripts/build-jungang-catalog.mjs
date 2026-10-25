import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const read = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'))
const observed = read('server/kakao-observed-menus.json')
const existing = read('server/existing-store-menu-source.json')
const coordinates = read('server/catalog-coordinates.json')
const points = new Map(coordinates.points.map(point => [point.placeId, point]))
const verifiedAt = '2026-10-25'

// Full shop menu names stay intact. Only the shared food category is simplified.
const categoryRules = [
  [/리조또/, 'risotto', '리조또'], [/파스타|까르보나라/, 'pasta', '파스타'],
  [/함박스테이크/, 'hamburg-steak', '함박스테이크'], [/스테이크/, 'steak', '스테이크'],
  [/샐러드/, 'salad', '샐러드'], [/스프|수프/, 'soup', '수프'],
  [/샤브/, 'shabu-shabu', '샤브샤브'], [/라멘|탄탄/, 'ramen', '라멘'],
  [/오므라이스/, 'omurice', '오므라이스'], [/볶음우동/, 'stir-fried-udon', '볶음우동'],
  [/우동/, 'udon', '우동'], [/모밀/, 'soba', '모밀'], [/카레/, 'curry', '카레'],
  [/까스|까츠|돈가스|모듬정식/, 'tonkatsu', '돈가스'],
  [/닭갈비/, 'dakgalbi', '닭갈비'], [/삼겹살/, 'pork-belly', '삼겹살'],
  [/갈비살/, 'beef-ribs', '소갈비살'], [/부대찌개/, 'budae-stew', '부대찌개'],
  [/김치찌개/, 'kimchi-stew', '김치찌개'], [/닭도리탕/, 'braised-chicken', '닭볶음탕'],
  [/막국수/, 'makguksu', '막국수'], [/냉면/, 'naengmyeon', '냉면'],
  [/갈비탕/, 'galbi-soup', '갈비탕'], [/오리주물럭/, 'duck-bulgogi', '오리주물럭'],
  [/볶음밥/, 'rice', '볶음밥'],
]
const categories = new Map(existing.categories.map(category => [category.id, { ...category, imageUrl: null }]))
function categoryFor(name) {
  if (/바게트 추가/.test(name)) return null
  const rule = categoryRules.find(([pattern]) => pattern.test(name))
  if (!rule) throw new Error(`기본 음식 분류를 확인하세요: ${name}`)
  const [, id, categoryName] = rule
  if (!categories.has(id)) categories.set(id, { id, name: categoryName, imageUrl: null })
  return id
}
const newPlaces = [
  ['589846825', '031-401-4752'], ['712291276', '031-411-3982'], ['1325696737', '031-410-0908'],
  ['395041368', '031-405-1611'], ['16311884', ''],
]
const restaurants = newPlaces.map(([placeId, phone]) => {
  const point = points.get(placeId)
  if (!point?.location) throw new Error(`검증된 식당 좌표가 필요합니다: ${placeId}`)
  return { id: `kakao-${placeId}`, name: point.name, address: point.address, location: point.location, phone,
    imageUrl: observed.restaurantImages[placeId] || null,
    source: { provider: 'KAKAO_MAP', placeId, url: `https://place.map.kakao.com/${placeId}`, verifiedAt, coordinateSource: point.finalUrl } }
})
for (const restaurant of existing.restaurants) {
  const point = points.get(restaurant.source.placeId)
  if (!point?.location) throw new Error(`기존 매장 좌표를 확인하세요: ${restaurant.name}`)
  const { locationCorrection, ...record } = restaurant
  restaurants.push({ ...record, location: point.location, source: { ...record.source, coordinateSource: point.finalUrl,
    ...(locationCorrection ? { locationCorrection } : {}) } })
}
const menus = newPlaces.flatMap(([placeId]) => observed.menusByPlace[placeId].map((menu, index) => ({
  id: `kakao-${placeId}-menu-${String(index + 1).padStart(2, '0')}`, restaurantId: `kakao-${placeId}`,
  name: menu.name, description: '', price: menu.price, categoryId: categoryFor(menu.name),
  salesStatus: 'AVAILABLE', informationStatus: 'INCOMPLETE', imageUrls: menu.imageUrls,
  isRepresentative: index < 4,
  source: { provider: 'KAKAO_MAP', url: `https://place.map.kakao.com/${placeId}#menuInfo`, verifiedAt,
    ...(menu.imageSourceSection ? { imageNote: menu.imageSourceSection } : {}) },
}))).concat(existing.menus.map(menu => ({ description: '', isRepresentative: true, ...menu })))
for (const category of categories.values()) {
  const illustrated = menus.find(menu => menu.categoryId === category.id && menu.imageUrls.length)
  if (illustrated) { category.imageUrl = illustrated.imageUrls[0]; category.source = illustrated.source }
}
// Preserve the established category ID while giving it a basic food label.
categories.set('spicy', { id: 'spicy', name: '아부라소바', imageUrl: null })
const catalog = { revision: 'ansan-jungang-2026-10-25-v1', verifiedAt, categories: [...categories.values()], restaurants, menus }
for (const path of ['server/new-catalog-source.json', 'server/demo-catalog.json']) writeFileSync(resolve(root, path), `${JSON.stringify(catalog, null, 2)}\n`)
const legacy = { categories: catalog.categories.map(({ id, name, imageUrl }) => ({ id, name, description: '', image: imageUrl || '' })),
  restaurants: catalog.restaurants.map(({ id, name, address, location }) => ({ id, name, address, location })),
  menus: catalog.menus.map(({ id, restaurantId, name, description, price, categoryId, salesStatus }) => ({ id, restaurantId, name, description, price, categoryId, salesStatus })) }
writeFileSync(resolve(root, 'src/data/registeredCatalog.ts'), `import type { RegisteredCatalog } from '../lib/registeredCatalog'\n\n// Generated from the verified Jungang Station catalog. Refresh with scripts/build-jungang-catalog.mjs.\nexport const registeredCatalog: RegisteredCatalog = ${JSON.stringify(legacy, null, 2)}\n`)
const station = points.get('27446506')
writeFileSync(resolve(root, 'src/data/jungangStation.ts'), `// Kakao Maps: ${station.finalUrl}\nexport const jungangStation = ${JSON.stringify({ id: `kakao-${station.placeId}`, name: '안산 중앙역 1번출구', address: station.address, ...station.location, url: `https://place.map.kakao.com/${station.placeId}`, category: '교통 > 지하철역' }, null, 2)}\n`)
console.log(JSON.stringify({ restaurants: restaurants.length, menus: menus.length, categories: categories.size, menuImages: menus.filter(menu => menu.imageUrls.length).length }))
