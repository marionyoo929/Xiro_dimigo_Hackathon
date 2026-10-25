import { test, expect } from '@playwright/test'

for (const width of [375, 402]) test(`merchant demo stays in nickname dialog at ${width}px`, async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width, height: 720 } })
  const page = await context.newPage()
  await page.goto(baseURL!)
  await expect(page.getByRole('button', { name: '사장님 화면 시연' })).toHaveCount(0)
  await expect(page.locator('.start-logo')).toBeVisible()
  await page.getByRole('button', { name: '이메일로 로그인하기' }).click()
  await expect(page.getByRole('button', { name: '사장님 시연 시작' })).toBeVisible()
  await page.getByRole('button', { name: '사장님 시연 시작' }).click()
  await expect(page).toHaveURL(/\/merchant$/)
  await expect(page.getByRole('heading', { name: '매장 주문' })).toBeVisible()
  await page.getByRole('button', { name: '로그아웃' }).click()
  await expect(page.locator('.start-logo')).toBeVisible()
  await expect(page.getByRole('button', { name: '사장님 화면 시연' })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await context.close()
})
