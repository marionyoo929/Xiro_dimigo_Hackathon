import { randomUUID } from 'node:crypto'
import { test, expect, type Page } from '@playwright/test'
import type { AuthTokens, CategoryCandidate, Job, Party, RestaurantCandidate, ReviewProgress } from '../src/types/api'
import { savedProfile } from './helpers/profile'

// Build a fresh review through the public API. Playwright's configured DB is
// temporary; these scenarios never open the developer's demo.sqlite file.
async function reviewFixture(page: Page, kind: 'category' | 'restaurant') {
  const redirectUri = 'http://localhost:5174/'
  const codeResponse = await page.request.post('/api/dev/login-codes', { data: { displayName: `검토 회귀 ${randomUUID().slice(0, 6)}`, merchant: false, redirectUri } })
  expect(codeResponse.ok(), await codeResponse.text()).toBe(true)
  const { authorizationCode } = await codeResponse.json()
  const authResponse = await page.request.post('/api/v1/auth/login', { data: { provider: 'demo', authorizationCode, redirectUri } })
  expect(authResponse.ok()).toBe(true)
  const session: AuthTokens = await authResponse.json()
  await savedProfile(page, session.accessToken)
  await page.addInitScript(value => sessionStorage.setItem('xiro.api-session.v1', JSON.stringify(value)), session)
  const request = async <T>(path: string, method = 'GET', body?: unknown, version?: number): Promise<T> => {
    const response = await page.request.fetch(`/api/v1${path}`, {
      method, headers: { Authorization: `Bearer ${session.accessToken}`, ...(method === 'GET' ? {} : { 'Idempotency-Key': randomUUID() }), ...(version === undefined ? {} : { 'If-Match': `"${version}"` }) },
      ...(body === undefined ? {} : { data: body }),
    })
    expect(response.ok(), `${method} ${path}: ${await response.text()}`).toBe(true)
    return response.status() === 204 ? undefined as T : response.json()
  }
  let party = await request<Party>('/parties', 'POST', { title: '검토 상태 회귀', location: { latitude: 37.566826, longitude: 126.9786567, address: '서울시청' }, searchRadiusMeters: 1000, budgetPerPerson: 25000, mealStyle: 'INDIVIDUAL_ORDER' })
  const base = `/parties/${party.id}`
  await request(`${base}/members/me/dietary-confirmation`, 'PUT', { confirmed: true, restrictionRevision: 1 })
  const generate = async (type: 'category' | 'restaurant') => {
    const job = await request<Job>(`${base}/${type}-candidates/generate`, 'POST')
    await expect.poll(async () => (await request<Job>(`/jobs/${job.id}`)).status).toBe('SUCCEEDED')
  }
  await generate('category')
  const categories = (await request<{ items: CategoryCandidate[] }>(`${base}/category-candidates`)).items
  if (kind === 'restaurant') {
    for (const candidate of categories) await request(`${base}/category-candidates/${candidate.id}/view`, 'POST')
    await request(`${base}/category-review/complete`, 'POST')
    party = await request<Party>(base)
    await request(`${base}/category-review/finalize`, 'POST', undefined, party.version)
    await generate('restaurant')
  }
  const candidates = kind === 'category' ? categories : (await request<{ items: RestaurantCandidate[] }>(`${base}/restaurant-candidates`)).items
  return { base, party, candidates, request }
}

test('failed confirmation never advances the count; retry and reload agree with review completion', async ({ page }) => {
  const f = await reviewFixture(page, 'category')
  let rejectViews = true
  await page.route(`**/api/v1${f.base}/category-candidates/*/view`, async route => {
    if (rejectViews) await route.fulfill({ status: 503, json: { error: { code: 'TEST_UNAVAILABLE', message: '확인 저장 테스트 실패' } } })
    else await route.continue()
  })
  await page.goto(`/party/${f.party.id}`)
  await expect(page.getByRole('button', { name: '확인 기록 다시 저장' })).toBeVisible()
  await expect(page.locator('.review-banner progress')).toHaveAttribute('value', '0')
  await expect(page.getByRole('button', { name: '메뉴 검토 완료', exact: true })).toBeDisabled()
  expect((await f.request<ReviewProgress>(`${f.base}/category-review/progress`)).viewedCount).toBe(0)
  rejectViews = false
  await page.getByRole('button', { name: '확인 기록 다시 저장' }).click()
  await expect.poll(async () => (await f.request<ReviewProgress>(`${f.base}/category-review/progress`)).viewedCount).toBeGreaterThan(0)
  for (const candidate of f.candidates) {
    const row = page.locator(`.food-row[data-candidate-id="${candidate.id}"]`)
    await row.scrollIntoViewIfNeeded()
    await expect.poll(async () => (await f.request<CategoryCandidate>(`${f.base}/category-candidates/${candidate.id}`)).viewedByMe).toBe(true)
  }
  await expect(page.locator('.review-banner progress')).toHaveAttribute('value', String(f.candidates.length))
  const complete = page.getByRole('button', { name: '메뉴 검토 완료', exact: true })
  await expect(complete).toBeEnabled()
  expect((await f.request<ReviewProgress>(`${f.base}/category-review/progress`)).viewedCount).toBe(f.candidates.length)
  await complete.click()
  await expect(page.getByRole('button', { name: '검토 완료 취소', exact: true })).toBeEnabled()
  await page.reload()
  await expect(page.locator('.review-banner progress')).toHaveAttribute('value', String(f.candidates.length))
  await expect(page.getByRole('button', { name: '검토 완료 취소', exact: true })).toBeEnabled()
  expect((await f.request<ReviewProgress>(`${f.base}/category-review/progress`)).reviewCompleted).toBe(true)
})

test('restaurant elimination animates, restores after a failed save, and then persists a successful swipe', async ({ page }) => {
  const f = await reviewFixture(page, 'restaurant'), candidate = f.candidates[0]
  await f.request(`${f.base}/restaurant-candidates/${candidate.id}/view`, 'POST')
  let unblock!: () => void, notifyRequest!: () => void
  const blocked = new Promise<void>(resolve => { unblock = resolve }), requested = new Promise<void>(resolve => { notifyRequest = resolve })
  const eliminationUrl = `**/api/v1${f.base}/restaurant-candidates/${candidate.id}/elimination`
  await page.route(eliminationUrl, async route => {
    notifyRequest(); await blocked
    await route.fulfill({ status: 503, json: { error: { code: 'TEST_UNAVAILABLE', message: '소거 저장 테스트 실패' } } })
  })
  await page.goto(`/party/${f.party.id}`)
  const card = page.locator(`.candidate-card[data-candidate-id="${candidate.id}"]`), row = card.locator('..')
  await card.scrollIntoViewIfNeeded()
  await card.getByRole('button', { name: '소거', exact: true }).click()
  await requested
  await expect(row).toHaveClass(/is-exiting/)
  await expect.poll(() => card.evaluate(element => getComputedStyle(element).transform)).not.toBe('none')
  unblock()
  await expect(row).not.toHaveClass(/is-exiting/)
  await expect(card).toHaveCSS('transform', 'none')
  await expect(card).not.toHaveClass(/eliminated/)
  await expect(page.getByRole('alert')).toContainText('소거 저장 테스트 실패')
  await page.unroute(eliminationUrl)
  await card.scrollIntoViewIfNeeded()
  const bounds = (await card.boundingBox())!
  await page.mouse.move(bounds.x + bounds.width - 22, bounds.y + 35); await page.mouse.down()
  await page.mouse.move(bounds.x + 12, bounds.y + 35, { steps: 8 }); await page.mouse.up()
  await expect(row).toHaveClass(/is-exiting/)
  await expect(card).toHaveClass(/eliminated/)
  await expect(row).not.toHaveClass(/is-exiting/)
  await expect(card).toHaveCSS('transform', 'none')
  await page.reload()
  await expect(page.locator(`.candidate-card[data-candidate-id="${candidate.id}"]`)).toHaveClass(/eliminated/)
})

test('a failed progress reload keeps completion locked until the latest state is retried', async ({ page }) => {
  const f = await reviewFixture(page, 'category'), last = f.candidates.at(-1)!
  for (const candidate of f.candidates.slice(0, -1)) await f.request(`${f.base}/category-candidates/${candidate.id}/view`, 'POST')
  let rejectProgress = false
  await page.route(`**/api/v1${f.base}/category-review/progress`, async route => {
    if (rejectProgress) await route.fulfill({ status: 503, json: { error: { code: 'TEST_UNAVAILABLE', message: '진행률 조회 테스트 실패' } } })
    else await route.continue()
  })
  await page.route(`**/api/v1${f.base}/category-candidates/${last.id}/view`, async route => {
    const response = await route.fetch()
    rejectProgress = true
    await route.fulfill({ response })
  })
  await page.goto(`/party/${f.party.id}`)
  await expect(page.locator('.review-banner progress')).toHaveAttribute('value', String(f.candidates.length - 1))
  const lastRow = page.locator(`.food-row[data-candidate-id="${last.id}"]`)
  // The observer must not count a thin sliver as a read, even after its dwell.
  await lastRow.evaluate(element => window.scrollTo(0, scrollY + element.getBoundingClientRect().top - innerHeight + 32))
  expect((await lastRow.boundingBox())!.y).toBeGreaterThan(800)
  await page.waitForTimeout(400)
  expect((await f.request<CategoryCandidate>(`${f.base}/category-candidates/${last.id}`)).viewedByMe).toBe(false)
  await lastRow.scrollIntoViewIfNeeded()
  await expect(page.getByText('최신 확인 상태를 불러오지 못했어요. 다시 확인해 주세요.', { exact: false })).toBeVisible()
  await expect(page.locator('.review-banner progress')).toHaveAttribute('value', String(f.candidates.length))
  const complete = page.getByRole('button', { name: '메뉴 검토 완료', exact: true })
  await expect(complete).toBeDisabled()
  expect((await f.request<ReviewProgress>(`${f.base}/category-review/progress`)).viewedCount).toBe(f.candidates.length)
  rejectProgress = false
  await page.getByRole('button', { name: '확인 기록 다시 저장' }).click()
  await expect(complete).toBeEnabled()
  await complete.click()
  await expect(page.getByRole('button', { name: '검토 완료 취소', exact: true })).toBeEnabled()
})
