import { expect, type Page } from '@playwright/test'

export async function completeProfile(page: Page, age = '18', gender = 'FEMALE') {
  await expect(page.getByRole('heading', { name: '시작하기 전에 알려주세요' })).toBeVisible()
  await page.getByLabel('나이 (만 나이)', { exact: true }).fill(age)
  await page.getByLabel('성별', { exact: true }).selectOption(gender)
  await page.getByRole('button', { name: '저장하고 계속하기', exact: true }).click()
  await expect(page.getByRole('heading', { name: '시작하기 전에 알려주세요' })).toHaveCount(0)
}
export async function savedProfile(page: Page, accessToken: string) {
  const response = await page.request.put('/api/v1/me/profile', { headers: { Authorization: `Bearer ${accessToken}` }, data: { age: 18, gender: 'FEMALE' } })
  expect(response.ok(), await response.text()).toBe(true)
}
export async function mockProfile(page: Page) {
  await page.route('**/api/v1/me/profile', route => route.fulfill({ json: { profile: { age: 18, gender: 'FEMALE', updatedAt: '2026-10-25T00:00:00Z' } } }))
}
