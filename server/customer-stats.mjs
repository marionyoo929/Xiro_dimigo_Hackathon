import { DAY, fail, now } from './common.mjs'

export const genders = ['FEMALE', 'MALE', 'OTHER', 'UNDISCLOSED']
const ageBands = ['0–9세', '10대', '20대', '30대', '40대', '50대', '60대 이상', '미입력']
const genderLabels = { FEMALE: '여성', MALE: '남성', OTHER: '기타', UNDISCLOSED: '응답 안 함', UNKNOWN: '미입력' }
const ageBand = age => age >= 60 ? '60대 이상' : age < 10 ? '0–9세' : `${Math.floor(age / 10) * 10}대`
const dayKey = timestamp => new Date(timestamp + 9 * 3600000).toISOString().slice(0, 10)
const analyticsOrders = service => [...service.store.all('order'), ...(service.options.demo ? service.store.all('demo-stats-order') : [])]

export function readProfile(service, userId) {
  const stored = service.store.get('customer-profile', userId)
  if (!stored) return { profile: null }
  const { age, gender, updatedAt } = stored
  return { profile: { age, gender, updatedAt } }
}

export function saveProfile(service, userId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 2 || !Object.hasOwn(body, 'age') || !Object.hasOwn(body, 'gender') || !Number.isInteger(body.age) || body.age < 1 || body.age > 120 || !genders.includes(body.gender)) fail(422, 'VALIDATION_ERROR', '나이는 1~120세로 입력하고 성별을 선택해 주세요.')
  service.put('customer-profile', { id: userId, age: body.age, gender: body.gender, updatedAt: now() })
  return readProfile(service, userId)
}

// Freeze only anonymous counts at submission. Later profile edits and guest
// cleanup must not change historical order statistics or expose exact ages.
export function snapshotOrderAudience(service, order) {
  const ageCounts = {}, genderCounts = {}
  let participants = 0
  for (const member of order.members.filter(m => m.items.length)) {
    const profile = service.store.get('customer-profile', member.userId)
    const age = profile ? ageBand(profile.age) : '미입력', gender = profile?.gender || 'UNKNOWN'
    ageCounts[age] = (ageCounts[age] || 0) + 1
    genderCounts[gender] = (genderCounts[gender] || 0) + 1
    participants++
  }
  service.put('order-audience', { id: order.id, participants, ageCounts, genderCounts })
  service.put('order-category-sales', { id: order.id, items: categorySales(service, order) })
}

function categorySales(service, order) {
  const rows = new Map()
  for (const member of order.members) for (const item of member.items) {
    const categoryId = service.store.get('menu', item.menuId)?.categoryId || null
    const category = categoryId && service.store.get('category', categoryId)
    const key = category?.id || 'UNCATEGORIZED'
    const row = rows.get(key) || { categoryId: category?.id || null, name: category?.name || '미분류', quantity: 0 }
    row.quantity += item.quantity; rows.set(key, row)
  }
  return [...rows.values()]
}

export function snapshotCategoryReview(service, set, finalizedAt = now()) {
  const category = item => ({ categoryId: item.category.id, name: item.category.name })
  return service.put('category-review-summary', { id: set.id, finalizedAt,
    eliminated: set.items.filter(item => item.eliminators.length).map(category),
    survived: set.items.filter(item => !item.eliminators.length).map(category) })
}

function marketInsights(service, restaurantId, start, end) {
  const categories = new Map()
  for (const order of analyticsOrders(service).filter(o => o.status === 'CONFIRMED' && o.submittedAt && Date.parse(o.submittedAt) >= start && Date.parse(o.submittedAt) < end)) {
    const items = service.store.get('order-category-sales', order.id)?.items || categorySales(service, order)
    for (const item of items) {
      const key = item.categoryId || 'UNCATEGORIZED', row = categories.get(key) || { categoryId: item.categoryId, name: item.name, quantity: 0, orderCount: 0 }
      row.quantity += item.quantity; row.orderCount++; categories.set(key, row)
    }
  }
  const ownIds = new Set(service.store.all('menu').filter(menu => menu.restaurantId === restaurantId && !menu.deleted && !menu.catalogRetired && menu.salesStatus !== 'HIDDEN' && menu.categoryId).map(menu => menu.categoryId))
  const ownCategories = [...ownIds].map(categoryId => ({ categoryId, name: service.store.get('category', categoryId)?.name || '미분류' }))
  const reviews = new Map(service.store.all('category-review-summary').map(review => [review.id, review]))
  if (service.options.demo) for (const review of service.store.all('demo-stats-review')) reviews.set(review.id, review)
  // Older reviews already have a dated survival event. Derive the anonymous
  // result without modifying parties, or guessing a finalization date.
  const finalizedEvents = new Map(service.store.all('analysis').filter(event => event.type === 'CATEGORY_SURVIVED').map(event => [event.resourceId, event.occurredAt]))
  for (const party of service.store.all('party')) for (const set of party.sets || []) {
    if (set.kind !== 'CATEGORY' || !set.finalized || reviews.has(set.id)) continue
    const finalizedAt = set.items.map(item => finalizedEvents.get(item.id)).find(Boolean)
    if (finalizedAt) reviews.set(set.id, { id: set.id, finalizedAt,
      eliminated: set.items.filter(item => item.eliminators.length).map(item => ({ categoryId: item.category.id, name: item.category.name })),
      survived: set.items.filter(item => !item.eliminators.length).map(item => ({ categoryId: item.category.id, name: item.category.name })) })
  }
  let finalizedReviews = 0, excludedReviews = 0
  const alternatives = new Map(), exclusions = new Map()
  for (const review of reviews.values()) {
    if (!(Date.parse(review.finalizedAt) >= start && Date.parse(review.finalizedAt) < end)) continue
    finalizedReviews++
    const eliminatedOwn = review.eliminated.filter(item => ownIds.has(item.categoryId))
    if (!eliminatedOwn.length) continue
    excludedReviews++
    for (const item of eliminatedOwn) {
      const row = exclusions.get(item.categoryId) || { ...item, partyCount: 0 }
      row.partyCount++; exclusions.set(item.categoryId, row)
    }
    for (const item of review.survived.filter(item => !ownIds.has(item.categoryId))) {
      const row = alternatives.get(item.categoryId) || { ...item, partyCount: 0 }
      row.partyCount++; alternatives.set(item.categoryId, row)
    }
  }
  const rank = rows => [...rows.values()].sort((a, b) => b.partyCount - a.partyCount || a.name.localeCompare(b.name, 'ko'))
  return { popularCategories: [...categories.values()].sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, 'ko')).slice(0, 10),
    categoryInsights: { ownCategories, finalizedReviews, excludedReviews, excludedOwnCategories: rank(exclusions), survivingAlternatives: rank(alternatives).map(row => ({ ...row, sharePercent: Math.round(row.partyCount / excludedReviews * 100) })) } }
}

export function merchantStats(service, restaurantId, days, timestamp = Date.now()) {
  const today = dayKey(timestamp), end = Date.parse(`${today}T00:00:00+09:00`) + DAY, start = end - days * DAY
  const orders = analyticsOrders(service).filter(o => o.restaurantId === restaurantId && o.status !== 'DRAFT' && o.submittedAt && Date.parse(o.submittedAt) >= start && Date.parse(o.submittedAt) < end)
  const daily = Array.from({ length: days }, (_, i) => ({ date: dayKey(start + i * DAY), orders: 0, confirmedOrders: 0, confirmedAmount: 0 }))
  const dailyByDate = new Map(daily.map(row => [row.date, row])), menus = new Map()
  const summary = { orders: orders.length, pendingOrders: 0, confirmedOrders: 0, rejectedOrders: 0, canceledOrders: 0, confirmedAmount: 0, averageConfirmedAmount: 0, participants: 0 }
  const ages = Object.fromEntries(ageBands.map(label => [label, 0])), genderCounts = Object.fromEntries(Object.keys(genderLabels).map(key => [key, 0]))
  for (const order of orders) {
    const row = dailyByDate.get(dayKey(Date.parse(order.submittedAt)))
    row.orders++
    if (order.status === 'SUBMITTED') summary.pendingOrders++
    if (order.status === 'REJECTED') summary.rejectedOrders++
    if (order.status === 'CANCELED') summary.canceledOrders++
    if (order.status !== 'CONFIRMED') continue
    summary.confirmedOrders++; summary.confirmedAmount += order.totalAmount
    row.confirmedOrders++; row.confirmedAmount += order.totalAmount
    for (const member of order.members) for (const item of member.items) {
      const menu = menus.get(item.menuId) || { menuId: item.menuId, name: item.menuName, quantity: 0, amount: 0 }
      menu.quantity += item.quantity; menu.amount += item.lineAmount; menus.set(item.menuId, menu)
    }
    const audience = service.store.get('order-audience', order.id)
    const participants = audience?.participants ?? order.members.filter(m => m.items.length).length
    summary.participants += participants
    if (audience) {
      for (const [key, count] of Object.entries(audience.ageCounts)) ages[key] += count
      for (const [key, count] of Object.entries(audience.genderCounts)) genderCounts[key] += count
    } else { ages['미입력'] += participants; genderCounts.UNKNOWN += participants }
  }
  summary.averageConfirmedAmount = summary.confirmedOrders ? Math.round(summary.confirmedAmount / summary.confirmedOrders) : 0
  return { restaurantId, days, from: new Date(start).toISOString(), toExclusive: new Date(end).toISOString(), timeZone: 'Asia/Seoul', summary, daily, market: marketInsights(service, restaurantId, start, end),
    popularMenus: [...menus.values()].sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, 'ko')).slice(0, 10),
    ageGroups: Object.entries(ages).map(([label, count]) => ({ label, count })),
    genders: Object.entries(genderCounts).map(([key, count]) => ({ label: genderLabels[key], count })), generatedAt: new Date(timestamp).toISOString() }
}
