import { test, expect } from '@playwright/test'
import { completeProfile } from './helpers/profile'

test('guest must save age and gender, failures preserve input, and edits survive refresh', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '게스트로 시작하기', exact: true }).click()
  await expect(page.getByRole('heading', { name: '시작하기 전에 알려주세요' })).toBeVisible()
  await expect(page.getByRole('button', { name: '＋ 파티 만들기', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '저장하고 계속하기', exact: true })).toBeDisabled()
  await page.getByLabel('나이 (만 나이)', { exact: true }).fill('17')
  await page.getByLabel('성별', { exact: true }).selectOption('UNDISCLOSED')
  let failSave = true
  await page.route('**/api/v1/me/profile', route => route.request().method() === 'PUT' && failSave
    ? route.fulfill({ status: 503, json: { error: { code: 'TEST_UNAVAILABLE', message: '기본 정보 저장 실패 테스트' } } })
    : route.continue())
  await page.getByRole('button', { name: '저장하고 계속하기', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('기본 정보 저장 실패 테스트')
  await expect(page.getByLabel('나이 (만 나이)', { exact: true })).toHaveValue('17')
  await expect(page.getByLabel('성별', { exact: true })).toHaveValue('UNDISCLOSED')
  failSave = false
  await page.getByRole('button', { name: '저장하고 계속하기', exact: true }).click()
  await expect(page.getByRole('button', { name: '＋ 파티 만들기', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: '＋ 파티 만들기', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '내 기본 정보 수정', exact: true }).click()
  await expect(page.getByLabel('나이 (만 나이)', { exact: true })).toHaveValue('17')
  await page.getByLabel('나이 (만 나이)', { exact: true }).fill('18')
  await page.getByLabel('성별', { exact: true }).selectOption('FEMALE')
  await page.getByRole('button', { name: '기본 정보 저장', exact: true }).click()
  await expect(page.getByRole('button', { name: '내 기본 정보 수정', exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: '내 기본 정보 수정', exact: true }).click()
  await expect(page.getByLabel('나이 (만 나이)', { exact: true })).toHaveValue('18')
  await expect(page.getByLabel('성별', { exact: true })).toHaveValue('FEMALE')
  await page.screenshot({ path: 'test-results/customer-profile.png', fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('existing customer cannot bypass a missing profile using a direct page link', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '게스트로 시작하기', exact: true }).click()
  await expect(page.getByRole('heading', { name: '시작하기 전에 알려주세요' })).toBeVisible()
  await page.goto('/create')
  await completeProfile(page, '21', 'MALE')
  await expect(page).toHaveURL(/\/create$/)
  await expect(page.getByRole('button', { name: '이 장소로 파티 만들기', exact: true })).toBeVisible()
})
