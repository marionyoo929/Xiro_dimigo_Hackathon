import { readFileSync } from 'node:fs'
import { now } from './common.mjs'
export const restrictionTargets = [
  ['PEANUT', '땅콩', 'ALLERGY'], ['MILK', '우유', 'ALLERGY'], ['EGG', '달걀', 'ALLERGY'], ['WHEAT', '밀', 'ALLERGY'], ['SOY', '대두', 'ALLERGY'], ['FISH', '생선', 'ALLERGY'], ['SHELLFISH', '갑각류', 'ALLERGY'],
  ['PORK', '돼지고기', 'RELIGIOUS'], ['BEEF', '소고기', 'RELIGIOUS'], ['ANIMAL_PRODUCT', '동물성 재료', 'VEGETARIAN'], ['MEAT', '육류', 'VEGETARIAN'], ['CILANTRO', '고수', 'INGREDIENT_AVOIDANCE'],
].map(([code, label, type]) => ({ code, label, type }))
export function seedReference(service) {
  const catalog = JSON.parse(readFileSync(new URL('./demo-catalog.json', import.meta.url), 'utf8'))
  for (const category of catalog.categories) if (!service.store.get('category', category.id)) service.put('category', { id: category.id, code: category.id.toUpperCase(), name: category.name, imageUrl: null })
  for (const target of restrictionTargets) if (!service.store.get('ingredient', target.code)) service.put('ingredient', { id: target.code, code: target.code, name: target.label })
}
export function seed(service) {
  const catalog = JSON.parse(readFileSync(new URL('./demo-catalog.json', import.meta.url), 'utf8'))
  const initialized = service.store.get('setting', 'demo-seeded')
  if (!initialized) service.put('user', { id: 'demo-merchant', displayName: '시연 사장님', principalType: 'USER', roles: ['USER', 'MERCHANT'] })
  seedReference(service)
  if (!initialized) for (const r of catalog.restaurants) service.put('restaurant', { ...r, version: 1, ownerId: 'demo-merchant', businessHours: [], phone: '000-0000-0000', orderEnabled: true, createdAt: now() })
  const metadata = {
    bibimbap: ['BEEF', 'SOY', 'MEAT', 'ANIMAL_PRODUCT'], noodles: ['WHEAT', 'FISH', 'ANIMAL_PRODUCT'], tonkatsu: ['PORK', 'WHEAT', 'EGG', 'MEAT', 'ANIMAL_PRODUCT'],
    'bibimbap-b': ['SOY'], pasta: ['WHEAT', 'MILK', 'ANIMAL_PRODUCT'], salad: [], soldout: ['FISH', 'ANIMAL_PRODUCT'], hidden: ['WHEAT', 'MILK', 'ANIMAL_PRODUCT'],
    spicy: ['WHEAT', 'SOY', 'EGG', 'PORK', 'MEAT', 'ANIMAL_PRODUCT'], stew: ['PORK', 'MEAT', 'ANIMAL_PRODUCT'], sushi: ['FISH', 'ANIMAL_PRODUCT'],
    burger: ['BEEF', 'WHEAT', 'MEAT', 'ANIMAL_PRODUCT'], rice: ['EGG', 'SOY', 'ANIMAL_PRODUCT'], pizza: ['WHEAT', 'MILK', 'ANIMAL_PRODUCT'],
  }
  for (const m of catalog.menus) {
    if (service.store.get('menu', m.id)) continue
    const code = m.id.replace(/^demo-(city|wadong)-/, ''), codes = metadata[code] || []
    service.put('menu', { ...m, version: 1, ingredientIds: codes, allergenCodes: codes.filter(c => restrictionTargets.some(t => t.code === c && t.type === 'ALLERGY')), restrictionTargetCodes: codes, informationStatus: 'COMPLETE', imageUrls: [], isRepresentative: true, options: [], deleted: false })
  }
  if (!initialized) service.put('setting', { id: 'demo-seeded', version: 1 })
}
