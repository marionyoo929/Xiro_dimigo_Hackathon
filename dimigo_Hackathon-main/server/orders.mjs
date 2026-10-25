import { fail, host, id, match, member, missing, now, publicOrder, publicParty, publicMenu, state } from './common.mjs'
import { conflict, filteredMerchant, merchantRestaurant, qrRestaurant } from './catalog.mjs'
import { snapshotOrderAudience } from './customer-stats.mjs'

export function getOrder(service, req, merchant = false) {
  const order = service.get('order', req.params.orderId)
  if (merchant) merchantRestaurant(service, order.restaurantId, req.user)
  else if (!order.members.some(m => m.userId === req.user.id)) missing()
  return order
}
function draft(order) { if (order.status !== 'DRAFT') fail(409, 'ORDER_NOT_EDITABLE', '제출한 주문은 수정할 수 없어요.') }
function editable(order, req) {
  draft(order); match(req, order.version)
  const me = order.members.find(m => m.userId === req.user.id) || missing()
  if (me.selectionStatus === 'COMPLETED') fail(409, 'REVIEW_LOCKED', '메뉴 선택 완료를 먼저 취소해 주세요.')
  return me
}
function restrictions(service, order) { return order.type === 'PARTY' ? service.partyRestrictions(order.partyId) : service.restrictions(order.members[0].userId).items }
function price(service, order, input, itemId = id()) {
  const menu = service.store.get('menu', input.menuId)
  if (!menu || menu.restaurantId !== order.restaurantId || menu.deleted || menu.salesStatus !== 'AVAILABLE') fail(409, 'MENU_UNAVAILABLE', '판매 중인 메뉴를 선택해 주세요.', { menuId: input.menuId })
  const code = conflict(menu, restrictions(service, order))
  if (code) fail(409, code, '식사 제한과 충돌하거나 재료 정보가 부족한 메뉴예요.', { menuId: menu.id })
  const options = [], seen = new Set()
  for (const selection of input.options) {
    const group = menu.options.find(g => g.id === selection.optionId), value = group?.values.find(v => v.id === selection.valueId), key = `${selection.optionId}:${selection.valueId}`
    if (!group || !value || seen.has(key)) fail(422, 'VALIDATION_ERROR', '메뉴 옵션을 확인해 주세요.')
    if (value.salesStatus !== 'AVAILABLE') fail(409, 'MENU_UNAVAILABLE', '선택한 옵션이 품절됐어요.')
    seen.add(key); options.push({ ...selection, optionName: group.name, valueName: value.name, additionalPrice: value.additionalPrice })
  }
  for (const group of menu.options) {
    const count = options.filter(o => o.optionId === group.id).length
    if (count < group.minSelections || count > group.maxSelections) fail(422, 'VALIDATION_ERROR', `${group.name} 선택 개수를 확인해 주세요.`)
  }
  const unitPrice = money(menu.price + options.reduce((sum, o) => sum + o.additionalPrice, 0)), lineAmount = money(unitPrice * input.quantity)
  return { id: itemId, menuId: menu.id, menuName: menu.name, quantity: input.quantity, options, request: input.request || '', unitPrice, lineAmount, menuVersion: menu.version }
}
function money(value) { if (!Number.isSafeInteger(value) || value < 0 || value > 2147483647) fail(422, 'VALIDATION_ERROR', '주문 금액 범위를 초과했어요.'); return value }
function reprice(service, order, onlyUserId = null) {
  return order.members.map(m => onlyUserId && m.userId !== onlyUserId ? m : ({ ...m, items: m.items.map(item => {
    try { return price(service, order, { ...item, options: item.options.map(({ optionId, valueId }) => ({ optionId, valueId })) }, item.id) }
    catch (e) { if (e.details) e.details.orderItemId = item.id; throw e }
  }) }))
}
export function orderChanged(order, type = 'order.item_changed') {
  order.totalAmount = money(order.members.reduce((sum, m) => sum + m.items.reduce((n, i) => n + i.lineAmount, 0), 0)); order.version++
  this.put('order', order, order.partyId)
  this.event(`order:${order.id}`, type, order, { status: order.status, ...(order.rejection ? { rejection: order.rejection } : {}) })
  if (order.partyId) { const p = this.get('party', order.partyId); this.event(`party:${p.id}`, type, p, { orderId: order.id, status: order.status }) }
  const r = this.get('restaurant', order.restaurantId); this.event(`restaurant:${r.id}`, type, r, { orderId: order.id, status: order.status })
}
function newOrder(service, restaurantId, party = null, user = null) {
  const members = party ? party.members.map(m => ({ memberId: m.id, userId: m.userId, displayName: m.displayName, selectionStatus: 'IN_PROGRESS', items: [] }))
    : [{ memberId: id(), userId: user.id, displayName: user.displayName, selectionStatus: 'IN_PROGRESS', items: [] }]
  return service.put('order', { id: id(), type: party ? 'PARTY' : 'QR_GUEST', status: 'DRAFT', version: 1, partyId: party?.id || null, restaurantId, members, totalAmount: 0, pricingVersion: 1, createdAt: now(), submittedAt: null, confirmedAt: null, rejection: null }, party?.id || null)
}
export const orderHandlers = {
  connectPartyStore(req) {
    const p = this.party(req.params.partyId, req.user); host(p, req.user); match(req, p.version); state(p, 'RESTAURANT_SELECTED')
    const { restaurant } = qrRestaurant(this, req.body.qrToken)
    if (restaurant.id !== p.selectedRestaurantId) fail(409, 'QR_RESTAURANT_MISMATCH', '선택한 식당의 QR을 사용해 주세요.')
    if (!restaurant.orderEnabled) fail(409, 'STORE_ORDER_DISABLED', '지금은 주문을 받지 않는 매장이에요.')
    const order = newOrder(this, restaurant.id, p)
    p.orderId = order.id; p.connectedRestaurantId = restaurant.id; p.state = 'ORDERING'; this.partyChanged(p, 'store.connected', { orderId: order.id })
    return { party: publicParty(p, req.user), order: publicOrder(order, req.user) }
  },
  ensurePartyOrder(req) {
    const p = this.party(req.params.partyId, req.user); host(p, req.user); state(p, 'ORDERING')
    if (!p.connectedRestaurantId) fail(409, 'RESTAURANT_NOT_SELECTED', '매장 QR을 먼저 연결해 주세요.')
    let order = p.orderId && this.store.get('order', p.orderId)
    if (!order) { order = this.store.all('order').find(o => o.partyId === p.id) || newOrder(this, p.connectedRestaurantId, p); p.orderId = order.id; this.partyChanged(p) }
    return publicOrder(order, req.user)
  },
  getPartyOrder(req) { const p = this.party(req.params.partyId, req.user); if (!p.orderId) missing(); return publicOrder(this.get('order', p.orderId), req.user) },
  createQrGuestOrderSession(req) {
    const { restaurant } = qrRestaurant(this, req.params.qrToken)
    if (!restaurant.orderEnabled) fail(409, 'STORE_ORDER_DISABLED', '지금은 주문을 받지 않는 매장이에요.')
    const user = { id: id(), displayName: req.body.displayName, principalType: 'ORDER_GUEST', roles: [], created: Date.now() }
    const order = newOrder(this, restaurant.id, null, user); user.scopeId = order.id; this.put('user', user)
    return { ...this.tokens(user, true), order: publicOrder(order, user) }
  },
  getOrder(req) { return publicOrder(getOrder(this, req), req.user) },
  listOrderMenus(req) {
    const order = getOrder(this, req)
    const menus = this.store.all('menu').filter(m => m.restaurantId === order.restaurantId && !m.deleted && m.salesStatus !== 'HIDDEN' && !conflict(m, restrictions(this, order)))
    const page = this.page(menus.map(publicMenu), req); page.items.forEach(m => this.analysis('MENU_VIEWED', m.id, req.user.id)); return page
  },
  addMyOrderItem(req) { const o = getOrder(this, req), me = editable(o, req); me.items.push(price(this, o, req.body)); this.orderChanged(o); this.analysis('MENU_SELECTED', req.body.menuId, req.user.id); return publicOrder(o, req.user) },
  updateMyOrderItem(req) {
    const o = getOrder(this, req), me = editable(o, req), index = me.items.findIndex(i => i.id === req.params.orderItemId)
    if (index < 0) missing()
    const previous = me.items[index], input = { ...previous, options: previous.options.map(({ optionId, valueId }) => ({ optionId, valueId })), ...req.body }
    me.items[index] = price(this, o, input, previous.id); this.orderChanged(o); return publicOrder(o, req.user)
  },
  deleteMyOrderItem(req) { const o = getOrder(this, req), me = editable(o, req); if (!me.items.some(i => i.id === req.params.orderItemId)) missing(); me.items = me.items.filter(i => i.id !== req.params.orderItemId); this.orderChanged(o); return publicOrder(o, req.user) },
  completeMyOrderSelection(req) {
    const o = getOrder(this, req); draft(o); match(req, o.version)
    const me = o.members.find(m => m.userId === req.user.id)
    if (!me.items.length) fail(409, 'EMPTY_ORDER', '메뉴를 한 개 이상 선택해 주세요.')
    const checked = reprice(this, o, req.user.id)
    if (checked.some((m, n) => m.items.some((i, k) => i.lineAmount !== o.members[n].items[k].lineAmount))) return priceChanged.call(this, o, checked, req.user)
    if (me.selectionStatus !== 'COMPLETED') { me.selectionStatus = 'COMPLETED'; this.orderChanged(o, 'order.member_completed') }
    return publicOrder(o, req.user)
  },
  reopenMyOrderSelection(req) { const o = getOrder(this, req); draft(o); match(req, o.version); const me = o.members.find(m => m.userId === req.user.id); if (me.selectionStatus !== 'IN_PROGRESS') { me.selectionStatus = 'IN_PROGRESS'; this.orderChanged(o, 'order.member_reopened') } return publicOrder(o, req.user) },
  submitOrder(req) {
    const o = getOrder(this, req)
    if (o.partyId) { const p = this.party(o.partyId, req.user); host(p, req.user); this.requireActiveGuests(p) }
    draft(o); match(req, o.version)
    if (o.members.some(m => m.selectionStatus !== 'COMPLETED' || !m.items.length)) fail(409, 'MEMBER_SELECTION_INCOMPLETE', '모든 참가자의 메뉴 선택 완료를 기다려 주세요.')
    if (!this.get('restaurant', o.restaurantId).orderEnabled) fail(409, 'STORE_ORDER_DISABLED', '매장이 주문 접수를 중단했어요.')
    const checked = reprice(this, o)
    if (checked.some((m, n) => m.items.some((i, k) => i.lineAmount !== o.members[n].items[k].lineAmount))) return priceChanged.call(this, o, checked, req.user)
    o.members = checked; o.status = 'SUBMITTED'; o.submittedAt = now()
    snapshotOrderAudience(this, o)
    if (o.partyId) { const p = this.get('party', o.partyId); state(p, 'ORDERING'); p.state = 'ORDER_SUBMITTED'; this.partyChanged(p) }
    this.orderChanged(o, 'order.submitted'); this.analysis('ORDER_SUBMITTED', o.id, req.user.id); this.audit(req.user, 'order.submit', o, 'DRAFT', req.requestId)
    return publicOrder(o, req.user)
  },
  listMerchantOrders(req) { return this.page(filteredMerchant(this, req, 'order').filter(o => o.status !== 'DRAFT').map(o => publicOrder(o, req.user)), req) },
  getMerchantOrder(req) { return publicOrder(getOrder(this, req, true), req.user) },
  confirmMerchantOrder(req) { return merchantTransition.call(this, req, true) },
  rejectMerchantOrder(req) { return merchantTransition.call(this, req, false) },
}
function priceChanged(order, members, user) {
  order.members = members.map(m => ({ ...m, selectionStatus: 'IN_PROGRESS' })); order.pricingVersion++; this.orderChanged(order, 'order.draft_updated')
  // A committed conflict: clients must re-confirm these new prices. The caller
  // commits this result and caches it just like a success before sending 409.
  return { committedError: { status: 409, code: 'ORDER_PRICE_CHANGED', message: '가격이 변경됐어요. 새 금액을 확인하고 선택을 다시 완료해 주세요.', details: { order: publicOrder(order, user) } } }
}
function merchantTransition(req, confirmed) {
  const o = getOrder(this, req, true); match(req, o.version)
  if (o.status !== 'SUBMITTED') fail(409, 'INVALID_ORDER_STATE', '접수 대기 중인 주문만 처리할 수 있어요.')
  o.status = confirmed ? 'CONFIRMED' : 'REJECTED'; o.confirmedAt = confirmed ? now() : null; o.rejection = confirmed ? null : req.body
  if (o.partyId) { const p = this.get('party', o.partyId); p.state = confirmed ? 'ORDER_CONFIRMED' : 'ORDER_REJECTED'; this.partyChanged(p) }
  this.orderChanged(o, confirmed ? 'order.confirmed' : 'order.rejected'); this.audit(req.user, confirmed ? 'order.confirm' : 'order.reject', o, 'SUBMITTED', req.requestId)
  // Never infer a fee rate from examples in the requirements.
  const commission = confirmed ? this.put('commission', { id: id(), orderId: o.id, restaurantId: o.restaurantId, basis: 'ORDER_CONFIRMED', orderAmount: o.totalAmount, policyId: null, feeType: null, feeRate: null, feeAmount: null, status: 'PENDING', createdAt: now() }, o.id) : null
  if (confirmed) this.analysis('ORDER_CONFIRMED', o.id)
  this.expireGuests()
  return confirmed ? { order: publicOrder(o, req.user), commission } : publicOrder(o, req.user)
}
