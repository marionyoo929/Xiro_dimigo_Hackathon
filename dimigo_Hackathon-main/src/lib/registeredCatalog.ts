export const MIN_RADIUS_METERS = 200
export const MAX_RADIUS_METERS = 1000
export const RADIUS_STEP_METERS = 10

export function normalizeRadiusMeters(value: number): number {
  if (!Number.isFinite(value)) return MAX_RADIUS_METERS
  return Math.max(MIN_RADIUS_METERS, Math.min(MAX_RADIUS_METERS, Math.round(value / RADIUS_STEP_METERS) * RADIUS_STEP_METERS))
}
export const formatRadius = (meters: number) => meters === 1000 ? '1km' : `${meters}m`

// Names follow Location/Restaurant/Menu in docs/openapi.yaml; this is the subset
// needed by the picker, not the complete merchant API response.
export interface CatalogLocation { latitude: number; longitude: number }
export interface RegisteredRestaurant {
  id: string; name: string; location: CatalogLocation; address: string
}
export interface RegisteredMenu {
  id: string; restaurantId: string; name: string; description: string; price: number
  categoryId: string | null; salesStatus: 'AVAILABLE' | 'SOLD_OUT' | 'HIDDEN'
}
export interface CatalogCategory {
  id: string; name: string; description: string; image: string
}
export interface RegisteredCatalog {
  restaurants: RegisteredRestaurant[]; menus: RegisteredMenu[]; categories: CatalogCategory[]
}
export interface CatalogQuery {
  location: CatalogLocation; searchRadiusMeters: number; budgetPerPerson: number | null
}
export interface RegisteredFoodCandidate {
  id: string; name: string; description: string; image: string; price: string; detail: string
  nearbyRestaurantCount: number; priceRange: { min: number; max: number }
  menuIds: string[]; restaurantIds: string[]
}

export function distanceMeters(from: CatalogLocation, to: CatalogLocation): number {
  const radians = (degrees: number) => degrees * Math.PI / 180
  const dLat = radians(to.latitude - from.latitude)
  const dLng = radians(to.longitude - from.longitude)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(dLng / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)))
}

export function nearbyRegisteredRestaurants(catalog: RegisteredCatalog, query: Pick<CatalogQuery, 'location' | 'searchRadiusMeters'>) {
  const seen = new Set<string>()
  return catalog.restaurants.filter(restaurant => {
    if (seen.has(restaurant.id)) return false
    seen.add(restaurant.id)
    const distance = distanceMeters(query.location, restaurant.location)
    return Number.isFinite(distance) && distance <= query.searchRadiusMeters
  })
}

export function registeredCategoryCandidates(catalog: RegisteredCatalog, query: CatalogQuery): RegisteredFoodCandidate[] {
  const restaurantIds = new Set(nearbyRegisteredRestaurants(catalog, query).map(restaurant => restaurant.id))
  const groups = new Map<string, RegisteredMenu[]>()
  for (const menu of catalog.menus) {
    if (!restaurantIds.has(menu.restaurantId) || menu.salesStatus !== 'AVAILABLE' || !menu.categoryId ||
      !Number.isFinite(menu.price) || menu.price < 0 || (query.budgetPerPerson !== null && menu.price > query.budgetPerPerson)) continue
    const group = groups.get(menu.categoryId) || []
    group.push(menu)
    groups.set(menu.categoryId, group)
  }
  return catalog.categories.flatMap(category => {
    const menus = groups.get(category.id)
    if (!menus?.length) return []
    const prices = menus.map(menu => menu.price)
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    const ids = [...new Set(menus.map(menu => menu.restaurantId))]
    return [{
      id: category.id, name: category.name, description: category.description, image: category.image,
      price: min === max ? `${min.toLocaleString('ko-KR')}원` : `${min.toLocaleString('ko-KR')}원~${max.toLocaleString('ko-KR')}원`,
      detail: `주변 등록 식당 ${ids.length}곳 · 판매 메뉴 ${menus.length}개`,
      nearbyRestaurantCount: ids.length, priceRange: { min, max },
      menuIds: menus.map(menu => menu.id), restaurantIds: ids,
    }]
  })
}
