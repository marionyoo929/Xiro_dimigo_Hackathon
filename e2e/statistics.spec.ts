import { test, expect } from '@playwright/test'
import { Store } from '../server/store.mjs'
import { Service } from '../server/service.mjs'
import { seedStatistics } from '../server/demo-stats.mjs'
import type { StoreStats } from '../src/types/customerStats'

test('merchant sees category market trends, surviving alternatives and customer composition over 3, 7 and 30 days', async ({ page }) => {
  const dbPath = process.env.XIRO_E2E_DB_PATH
  expect(dbPath).toMatch(/xiro-e2e-/)
  const store = new Store(dbPath!)
  try { store.transaction(() => seedStatistics(new Service(store, { demo: true }))) } finally { store.close() }
  await page.setViewportSize({ width: 320, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: '이메일로 로그인하기', exact: true }).click()
  await page.getByRole('button', { name: '사장님 시연 시작', exact: true }).click()
  await page.getByRole('button', { name: '통계', exact: true }).click()
  await expect(page.getByRole('table', { name: '전체 가게 카테고리 순위' })).toBeVisible()
  const counts: number[] = []
  for (const [days, label] of [[3, '최근 3일'], [7, '일주일'], [30, '한 달']] as const) {
    const responsePromise = page.waitForResponse(response => response.url().includes(`/stats?days=${days}`) && response.ok())
    await page.getByRole('button', { name: label, exact: true }).click()
    const stats: StoreStats = await (await responsePromise).json()
    await expect(page.getByRole('table', { name: '전체 가게 카테고리 순위' }).locator('tbody tr').first()).toContainText(stats.market.popularCategories[0].name)
    await expect(page.getByRole('table', { name: '전체 가게 카테고리 순위' }).locator('tbody tr').first()).toContainText(`${stats.market.popularCategories[0].quantity}개`)
    await expect(page.getByRole('list', { name: '살아남은 다른 카테고리' })).toBeVisible()
    await expect(page.getByText(`수락한 주문 참여 인원 ${stats.summary.participants}명`, { exact: false })).toBeVisible()
    expect(stats.market.categoryInsights.excludedReviews).toBeGreaterThan(0)
    expect(stats.daily).toHaveLength(days)
    counts.push(stats.summary.orders)
  }
  expect(counts[1]).toBeGreaterThan(counts[0]); expect(counts[2]).toBeGreaterThan(counts[1])
  await page.screenshot({ path: 'test-results/merchant-statistics-populated.png', fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const select = page.getByLabel('내 매장', { exact: true }), options = await select.locator('option').evaluateAll(nodes => nodes.map(node => (node as HTMLOptionElement).value))
  await select.selectOption(options[1])
  await expect(page.getByRole('table', { name: '전체 가게 카테고리 순위' })).toBeVisible()
  await expect(page.getByRole('button', { name: '한 달', exact: true })).toHaveAttribute('aria-pressed', 'true')
})
