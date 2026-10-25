import { DAY } from './common.mjs'

// Analytics-only fixtures: never create active orders, parties, users or fees.
// A repeat run replaces only these records and their anonymous snapshots.
export function seedStatistics(service, timestamp = Date.now()) {
  const restaurants = service.store.all('restaurant').filter(r => !r.catalogRetired)
  const menus = service.store.all('menu').filter(m => !m.deleted && !m.catalogRetired && m.salesStatus === 'AVAILABLE' && m.categoryId && m.price > 0)
  const categoryIds = new Set(menus.filter(m => restaurants.some(r => r.id === m.restaurantId)).map(m => m.categoryId))
  const categories = service.store.all('category').filter(c => categoryIds.has(c.id))
  if (!restaurants.length || categories.length < 2) throw new Error('등록된 매장과 서로 다른 음식 카테고리가 필요합니다.')
  for (const order of service.store.all('demo-stats-order')) {
    service.store.delete('order-audience', order.id); service.store.delete('order-category-sales', order.id)
    service.store.delete('demo-stats-order', order.id)
  }
  for (const review of service.store.all('demo-stats-review')) service.store.delete('demo-stats-review', review.id)
  const date = new Date(timestamp + 9 * 3600000).toISOString().slice(0, 10), today = Date.parse(`${date}T00:00:00+09:00`)
  let randomState = 9292026, orderCount = 0, reviewCount = 0
  const random = () => { randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState / 4294967296 }
  const pick = rows => rows[Math.floor(random() * rows.length)]
  const choose = (rows, weight) => {
    const total = rows.reduce((sum, row) => sum + weight(row), 0)
    let cursor = random() * total
    return rows.find(row => (cursor -= weight(row)) < 0) || rows.at(-1)
  }
  const at = day => new Date(today - day * DAY + Math.floor(random() * Math.max(1, Math.min(DAY - 1, timestamp - (today - day * DAY))))).toISOString()
  for (let day = 29; day >= 0; day--) {
    for (const restaurant of restaurants) {
      const available = menus.filter(m => m.restaurantId === restaurant.id)
      if (!available.length) continue
      const trend = available.some(m => /소바|라멘/.test(m.name)) ? day < 3 ? 6 : 1 : available.some(m => /파스타|리조또/.test(m.name)) && day < 7 ? 3 : 0
      const count = 3 + Math.floor(random() * 4) + trend + ([0, 6].includes(new Date(today - day * DAY + 12 * 3600000).getUTCDay()) ? 2 : 0)
      for (let n = 0; n < count; n++) {
        const id = `stats-${date}-${day}-${orderCount++}`, members = [], ageCounts = {}, genderCounts = {}
        const participants = 1 + Math.floor(random() * 4)
        for (let p = 0; p < participants; p++) {
          const menu = choose(available, m => /소바/.test(m.name) && day < 3 ? 7 : m.isRepresentative ? 3 : 1)
          const quantity = random() < 0.15 ? 2 : 1
          members.push({ items: [{ menuId: menu.id, menuName: menu.name, quantity, lineAmount: menu.price * quantity }] })
          const age = pick(['10대', '20대', '20대', '20대', '30대', '30대', '40대', '50대', '60대 이상'])
          const gender = pick(['FEMALE', 'FEMALE', 'MALE', 'MALE', 'UNDISCLOSED', 'OTHER'])
          ageCounts[age] = (ageCounts[age] || 0) + 1; genderCounts[gender] = (genderCounts[gender] || 0) + 1
        }
        const statusRoll = random(), status = statusRoll < 0.86 ? 'CONFIRMED' : statusRoll < 0.96 ? 'REJECTED' : 'CANCELED'
        const submittedAt = at(day), totalAmount = members.reduce((sum, member) => sum + member.items.reduce((n, item) => n + item.lineAmount, 0), 0)
        service.put('demo-stats-order', { id, restaurantId: restaurant.id, status, submittedAt, totalAmount, members })
        service.put('order-audience', { id, participants, ageCounts, genderCounts })
        const sales = new Map()
        for (const member of members) for (const item of member.items) {
          const categoryId = available.find(menu => menu.id === item.menuId).categoryId, category = categories.find(c => c.id === categoryId)
          const row = sales.get(categoryId) || { categoryId, name: category.name, quantity: 0 }
          row.quantity += item.quantity; sales.set(categoryId, row)
        }
        service.put('order-category-sales', { id, items: [...sales.values()] })
      }
    }
    const dailyReviews = 12 + Math.floor(random() * 10) + (day < 3 ? 6 : 0)
    for (let n = 0; n < dailyReviews; n++) {
      const candidates = categories.map(category => ({ category, score: random() })).sort((a, b) => a.score - b.score).slice(0, Math.min(15, categories.length))
      const survived = [], eliminated = []
      for (const { category } of candidates) {
        const spicy = /소바|라멘|닭갈비/.test(category.name), pasta = /파스타|리조또/.test(category.name)
        const probability = spicy ? day < 3 ? 0.37 : 0.55 : pasta ? 0.17 : 0.3
        const row = { categoryId: category.id, name: category.name }
        if (random() < probability) eliminated.push(row)
        else survived.push(row)
      }
      if (!survived.length) survived.push(eliminated.pop())
      if (!eliminated.length && survived.length > 1) eliminated.push(survived.pop())
      service.put('demo-stats-review', { id: `stats-review-${date}-${reviewCount++}`, finalizedAt: at(day), eliminated, survived })
    }
  }
  service.put('setting', { id: 'statistics-seed', date, orders: orderCount, reviews: reviewCount })
  return { date, restaurants: restaurants.length, orders: orderCount, categoryReviews: reviewCount }
}
