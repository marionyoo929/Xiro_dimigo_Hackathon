import { test, expect } from '@playwright/test'
import { completeProfile } from './helpers/profile'

test('first login, stored session refresh, logout and login again', async ({ page }) => {
  const responses: { path: string; status: number; hasBody: boolean }[] = []
  page.on('response', response => {
    const path = new URL(response.url()).pathname
    if (!['/api/health', '/api/dev/login-codes', '/api/v1/auth/login', '/api/v1/me', '/api/v1/me/parties', '/api/v1/auth/refresh', '/api/v1/auth/logout'].includes(path)) return
    responses.push({ path, status: response.status(), hasBody: Number(response.headers()['content-length'] || 0) > 0 })
  })
  await page.goto('/')
  await expect(page.getByRole('button', { name: '이메일로 로그인하기' })).toBeEnabled()
  await page.getByRole('button', { name: '이메일로 로그인하기' }).click()
  await page.getByLabel('닉네임', { exact: true }).fill('세션 검증')
  await page.getByRole('button', { name: '시작하기', exact: true }).click()
  await completeProfile(page)
  await expect(page.getByRole('button', { name: '＋ 파티 만들기' })).toBeVisible()
  await expect.poll(() => responses.some(item => item.path === '/api/dev/login-codes' && item.status === 200 && item.hasBody)).toBe(true)
  await expect.poll(() => responses.some(item => item.path === '/api/v1/auth/login' && item.status === 200 && item.hasBody)).toBe(true)

  await page.reload()
  await expect(page.getByRole('button', { name: '＋ 파티 만들기' })).toBeVisible()
  await expect.poll(() => responses.some(item => item.path === '/api/v1/me' && item.status === 200 && item.hasBody)).toBe(true)

  // Expire only this isolated browser's access token; keep its refresh token.
  await page.evaluate(() => {
    const key = 'xiro.api-session.v1'
    const saved = JSON.parse(sessionStorage.getItem(key)!)
    sessionStorage.setItem(key, JSON.stringify({ ...saved, accessToken: 'expired-e2e-access' }))
  })
  await page.reload()
  await expect(page.getByRole('button', { name: '＋ 파티 만들기' })).toBeVisible()
  await expect.poll(() => responses.some(item => item.path === '/api/v1/auth/refresh' && item.status === 200 && item.hasBody)).toBe(true)

  await page.getByRole('button', { name: '로그아웃' }).click()
  await expect(page.getByRole('button', { name: '이메일로 로그인하기' })).toBeVisible()
  await expect.poll(() => responses.some(item => item.path === '/api/v1/auth/logout' && item.status === 204 && !item.hasBody)).toBe(true)
  await page.getByRole('button', { name: '이메일로 로그인하기' }).click()
  await page.getByLabel('닉네임', { exact: true }).fill('재로그인')
  await page.getByRole('button', { name: '시작하기', exact: true }).click()
  await completeProfile(page)
  await expect(page.getByRole('button', { name: '＋ 파티 만들기' })).toBeVisible()
})

test('empty auth response stays a visible failure', async ({ page }) => {
  await page.route('**/api/v1/auth/login', route => route.fulfill({ status: 502, body: '' }))
  await page.goto('/')
  await page.getByRole('button', { name: '이메일로 로그인하기' }).click()
  await page.getByLabel('닉네임', { exact: true }).fill('응답 검증')
  await page.getByRole('button', { name: '시작하기', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('서버 응답이 비어 있어요 (HTTP 502)')
  await expect(page.getByRole('button', { name: '＋ 파티 만들기' })).toHaveCount(0)
  await expect(page.getByText('Unexpected end of JSON input')).toHaveCount(0)
})

test('empty health and saved-session responses never appear as a successful login', async ({ page }) => {
  await page.route('**/api/health', route => route.fulfill({ status: 500, body: '' }))
  await page.goto('/')
  await expect(page.locator('.start-notice')).toContainText('서버 응답이 비어 있어요 (HTTP 500)')
  await expect(page.getByRole('button', { name: '이메일로 로그인하기' })).toBeDisabled()
  await page.unroute('**/api/health')
  await page.reload()
  await page.getByRole('button', { name: '이메일로 로그인하기' }).click()
  await page.getByLabel('닉네임', { exact: true }).fill('재접속 검증')
  await page.getByRole('button', { name: '시작하기', exact: true }).click()
  await completeProfile(page)
  await expect(page.getByRole('button', { name: '＋ 파티 만들기' })).toBeVisible()

  await page.route('**/api/v1/me', route => route.fulfill({ status: 500, body: '' }))
  await page.reload()
  await expect(page.getByRole('button', { name: '다시 연결' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('서버 응답이 비어 있어요 (HTTP 500)')
  await expect(page.getByRole('button', { name: '＋ 파티 만들기' })).toHaveCount(0)
  await page.unroute('**/api/v1/me')
  await page.getByRole('button', { name: '다시 연결' }).click()
  await expect(page.getByRole('button', { name: '＋ 파티 만들기' })).toBeVisible()
})
