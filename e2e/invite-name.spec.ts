import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import type { AuthTokens, InviteLink, Party } from '../src/types/api'
import { completeProfile, savedProfile } from './helpers/profile'

test('signed-in guest keeps the name entered on the invite, including reload and a failed rename retry', async ({ page, browser, baseURL }) => {
  const redirectUri = `${baseURL}/`
  const code = await page.request.post('/api/dev/login-codes', { data: { displayName: '이름 확인 방장', merchant: false, redirectUri } })
  const { authorizationCode } = await code.json()
  const auth = await page.request.post('/api/v1/auth/login', { data: { provider: 'demo', authorizationCode, redirectUri } })
  expect(auth.ok()).toBe(true)
  const session: AuthTokens = await auth.json()
  await savedProfile(page, session.accessToken)
  const headers = { Authorization: `Bearer ${session.accessToken}`, 'Idempotency-Key': randomUUID() }
  const created = await page.request.post('/api/v1/parties', { headers, data: { title: '입장 이름 확인', location: { latitude: 37.566826, longitude: 126.9786567, address: '서울시청' }, searchRadiusMeters: 1000, budgetPerPerson: 25000, mealStyle: 'INDIVIDUAL_ORDER' } })
  expect(created.ok()).toBe(true)
  const party: Party = await created.json()
  const invited = await page.request.post(`/api/v1/parties/${party.id}/invite-links`, { headers: { ...headers, 'Idempotency-Key': randomUUID() }, data: {} })
  const invite: InviteLink = await invited.json()
  const invitePath = new URL(invite.inviteUrl).pathname
  const hostContext = await browser.newContext()
  try {
    await hostContext.addInitScript(value => sessionStorage.setItem('xiro.api-session.v1', JSON.stringify(value)), session)
    const host = await hostContext.newPage()
    await host.goto(`/party/${party.id}`)
    await page.goto('/')
    await page.getByRole('button', { name: '게스트로 시작하기', exact: true }).click()
    await completeProfile(page)
    await expect(page.getByRole('button', { name: '＋ 파티 만들기', exact: true })).toBeVisible()
    await page.goto(invitePath)
    await page.getByLabel('닉네임', { exact: true }).fill('  민수  ')
    await page.getByRole('button', { name: '민수님으로 참여', exact: true }).click()
    await expect(page.locator('.member-name')).toHaveText(['이름 확인 방장', '민수'])
    await expect(page.locator('.flow-header>span')).toHaveText('민수')
    await expect(host.locator('.member-name')).toHaveText(['이름 확인 방장', '민수'])
    await page.reload()
    await expect(page.locator('.member-name')).toHaveText(['이름 확인 방장', '민수'])
    await expect(page.locator('.flow-header>span')).toHaveText('민수')

    let failRename = true
    await page.route(`**/api/v1/parties/${party.id}/members/me`, route => failRename
      ? route.fulfill({ status: 503, json: { error: { code: 'TEST_UNAVAILABLE', message: '이름 저장 재시도' } } })
      : route.continue())
    await page.goto(invitePath)
    await page.getByLabel('닉네임', { exact: true }).fill('지수')
    await page.getByRole('button', { name: '지수님으로 참여', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('이름 저장 재시도')
    await expect(page.getByLabel('닉네임', { exact: true })).toHaveValue('지수')
    failRename = false
    await page.getByRole('button', { name: '지수님으로 참여', exact: true }).click()
    await expect(page.locator('.member-name')).toHaveText(['이름 확인 방장', '지수'])
    await expect(page.locator('.flow-header>span')).toHaveText('지수')
    await expect(host.locator('.member-name')).toHaveText(['이름 확인 방장', '지수'])
    await expect(page.getByText('참가자 2/8', { exact: true })).toBeVisible()
  } finally { await hostContext.close() }
})
