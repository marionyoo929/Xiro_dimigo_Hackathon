import { distance, fail, hash, id, missing, now, publicMenu, publicRestaurant, secret } from './common.mjs'

export function merchantRestaurant(service, key, user) {
  if (!user.roles.includes('MERCHANT')) fail(403, 'FORBIDDEN', '사업자 계정이 필요해요.')
  const restaurant = service.get('restaurant', key)
  if (restaurant.ownerId !== user.id) missing()
  return restaurant
}
export function validMenu(service, menu) {
  if (menu.categoryId && !service.store.get('category', menu.categoryId)) fail(422, 'VALIDATION_ERROR', '음식 카테고리를 확인해 주세요.')
  if (menu.ingredientIds.some(code => !service.store.get('ingredient', code))) fail(422, 'VALIDATION_ERROR', '등록된 재료를 선택해 주세요.')
  if (menu.allergenCodes.some(code => !service.options.restrictionTargets.some(t => t.type === 'ALLERGY' && t.code === code)) || menu.restrictionTargetCodes.some(code => !service.options.restrictionTargets.some(t => t.code === code))) fail(422, 'VALIDATION_ERROR', '제한 코드를 확인해 주세요.')
  const groups = new Set()
  for (const option of menu.options) {
    if (groups.has(option.id) || option.minSelections > option.maxSelections || option.maxSelections > option.values.length || new Set(option.values.map(v => v.id)).size !== option.values.length) fail(422, 'VALIDATION_ERROR', '메뉴 옵션의 ID와 선택 개수를 확인해 주세요.')
    groups.add(option.id)
  }
}
export function conflict(menu, restrictions) {
  if (!restrictions.length) return null
  if (menu.informationStatus !== 'COMPLETE') return 'MENU_INFORMATION_INCOMPLETE'
  const codes = new Set([...menu.allergenCodes, ...menu.restrictionTargetCodes, ...menu.ingredientIds])
  return restrictions.some(r => codes.has(r.targetCode)) ? 'DIETARY_RESTRICTION_CONFLICT' : null
}
export function nearbyMenus(service, party) {
  const restaurants = service.store.all('restaurant').filter(r => distance(party.location, r.location) <= party.searchRadiusMeters)
  const ids = new Set(restaurants.map(r => r.id))
  const menus = service.store.all('menu').filter(m => ids.has(m.restaurantId) && !m.deleted && m.salesStatus === 'AVAILABLE' && m.categoryId && (party.budgetPerPerson === null || m.price <= party.budgetPerPerson))
  return { restaurants, menus }
}
export function qrRestaurant(service, token) {
  const qr = service.store.all('qr').find(q => hash(q.qrToken) === hash(token))
  if (!qr?.active) fail(410, 'QR_EXPIRED', '사용할 수 없는 매장 QR이에요.')
  return { qr, restaurant: service.get('restaurant', qr.restaurantId) }
}
export function filteredMerchant(service, req, kind) {
  if (!req.user.roles.includes('MERCHANT')) fail(403, 'FORBIDDEN', '사업자 계정이 필요해요.')
  const owned = new Set(service.store.all('restaurant').filter(r => r.ownerId === req.user.id).map(r => r.id))
  if (req.query.restaurantId && !owned.has(req.query.restaurantId)) missing()
  return service.store.all(kind).filter(value => owned.has(value.restaurantId) && (!req.query.restaurantId || value.restaurantId === req.query.restaurantId)
    && (!req.query.status || value.status === req.query.status) && (!req.query.from || value.createdAt >= req.query.from) && (!req.query.to || value.createdAt < req.query.to))
}
export const catalogHandlers = {
  listFoodCategories(req) { return this.page(this.store.all('category'), req) },
  listIngredients(req) { return this.page(this.store.all('ingredient'), req) },
  listRestrictionTargets(req) { return this.page(this.options.restrictionTargets, req) },
  createMerchantRestaurant(req) {
    if (!req.user.roles.includes('MERCHANT')) fail(403, 'FORBIDDEN', '사업자 계정이 필요해요.')
    validateHours(req.body.businessHours)
    return publicRestaurant(this.put('restaurant', { ...req.body, id: id(), ownerId: req.user.id, version: 1, createdAt: now() }))
  },
  listMerchantRestaurants(req) {
    if (!req.user.roles.includes('MERCHANT')) fail(403, 'FORBIDDEN', '사업자 계정이 필요해요.')
    return this.page(this.store.all('restaurant').filter(r => r.ownerId === req.user.id).map(publicRestaurant), req)
  },
  getMerchantRestaurant(req) { return publicRestaurant(merchantRestaurant(this, req.params.restaurantId, req.user)) },
  updateMerchantRestaurant(req) {
    const restaurant = merchantRestaurant(this, req.params.restaurantId, req.user)
    if (req.body.businessHours) validateHours(req.body.businessHours)
    Object.assign(restaurant, req.body, { version: restaurant.version + 1 }); this.put('restaurant', restaurant)
    return publicRestaurant(restaurant)
  },
  createMerchantMenu(req) {
    const r = merchantRestaurant(this, req.params.restaurantId, req.user)
    validMenu(this, req.body)
    return publicMenu(this.put('menu', { ...req.body, id: id(), restaurantId: r.id, version: 1, deleted: false }))
  },
  listMerchantMenus(req) { merchantRestaurant(this, req.params.restaurantId, req.user); return this.page(this.store.all('menu').filter(m => m.restaurantId === req.params.restaurantId && !m.deleted).map(publicMenu), req) },
  getMerchantMenu(req) { const menu = this.get('menu', req.params.menuId); merchantRestaurant(this, menu.restaurantId, req.user); if (menu.deleted) missing(); return publicMenu(menu) },
  updateMerchantMenu(req) {
    const menu = this.get('menu', req.params.menuId); merchantRestaurant(this, menu.restaurantId, req.user); if (menu.deleted) missing()
    const next = { ...menu, ...req.body, version: menu.version + 1 }; validMenu(this, next)
    return publicMenu(this.put('menu', next))
  },
  deleteMerchantMenu(req) { const menu = this.get('menu', req.params.menuId); merchantRestaurant(this, menu.restaurantId, req.user); this.put('menu', { ...menu, deleted: true, salesStatus: 'HIDDEN', version: menu.version + 1 }); return null },
  createMerchantQrCode(req) {
    const restaurant = merchantRestaurant(this, req.params.restaurantId, req.user), qrToken = secret()
    return this.put('qr', { id: id(), restaurantId: restaurant.id, qrToken, qrUrl: `${this.options.origin}/store/${qrToken}`, active: true, createdAt: now() })
  },
  listMerchantQrCodes(req) { merchantRestaurant(this, req.params.restaurantId, req.user); return this.page(this.store.all('qr').filter(q => q.restaurantId === req.params.restaurantId), req) },
  revokeMerchantQrCode(req) { merchantRestaurant(this, req.params.restaurantId, req.user); const qr = this.get('qr', req.params.qrCodeId); if (qr.restaurantId !== req.params.restaurantId) missing(); this.put('qr', { ...qr, active: false }); return null },
  getStoreQr(req) { const { restaurant } = qrRestaurant(this, req.params.qrToken); return { restaurantId: restaurant.id, restaurantName: restaurant.name, orderEnabled: restaurant.orderEnabled } },
  listMerchantCommissions(req) { return this.page(filteredMerchant(this, req, 'commission'), req) },
  getMerchantCommission(req) { const value = this.get('commission', req.params.commissionId); merchantRestaurant(this, value.restaurantId, req.user); return value },
}
function validateHours(hours) {
  const days = new Set()
  for (const h of hours) {
    if (days.has(h.dayOfWeek) || (!h.closesNextDay && h.closesAt <= h.opensAt)) fail(422, 'VALIDATION_ERROR', '영업시간을 확인해 주세요.')
    days.add(h.dayOfWeek)
  }
}
