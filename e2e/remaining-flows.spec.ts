import { test, expect, type Page } from '@playwright/test'
import type { Menu, Order, Party, User } from '../src/types/api'
import { mockProfile } from './helpers/profile'

const account: User = { id: 'flow-user', displayName: '흐름 검증', principalType: 'USER', roles: ['USER'] }
const menu: Menu = {
  id: 'flow-menu', restaurantId: 'matching-store', version: 1, name: '테스트 메뉴', description: '옵션과 요청사항을 수정해요.', price: 9000,
  categoryId: 'salad', ingredientIds: [], allergenCodes: [], restrictionTargetCodes: [], informationStatus: 'COMPLETE', imageUrls: [], isRepresentative: true, salesStatus: 'AVAILABLE',
  options: [{ id: 'topping', name: '추가 토핑', minSelections: 0, maxSelections: 1, values: [{ id: 'olive', name: '올리브', additionalPrice: 500, salesStatus: 'AVAILABLE' }] }],
}
const makeParty = (id: string, restaurantId = 'matching-store', version = 8): Party => ({
  id, title: `${id} 파티`, hostMemberId: 'host-member', myMemberId: 'host-member', state: 'RESTAURANT_SELECTED', version, scheduledAt: null,
  location: { latitude: 37.5668, longitude: 126.9786, address: '서울시청' }, searchRadiusMeters: 1000, budgetPerPerson: null, mealStyle: 'INDIVIDUAL_ORDER',
  memberCount: 1, maxMembers: 8, members: [{ id: 'host-member', displayName: account.displayName, role: 'HOST', connectionStatus: 'ONLINE', restrictionConfirmed: true, categoryReviewStatus: 'COMPLETED', restaurantReviewStatus: 'COMPLETED' }],
  candidateSets: [], selectedRestaurantId: restaurantId, orderId: null, generationJobId: null, createdAt: '2026-10-25T00:00:00Z',
})
const makeOrder = (): Order => ({
  id: 'flow-order', type: 'PARTY', status: 'DRAFT', version: 3, partyId: 'ordering-party', restaurantId: menu.restaurantId, myMemberId: 'host-member', totalAmount: 9000, pricingVersion: 1,
  members: [{ memberId: 'host-member', displayName: account.displayName, selectionStatus: 'IN_PROGRESS', items: [{ id: 'flow-item', menuId: menu.id, menuName: menu.name, quantity: 1, options: [], request: '기존 요청', unitPrice: 9000, lineAmount: 9000, menuVersion: 1 }] }],
  createdAt: '2026-10-25T00:00:00Z', submittedAt: null, confirmedAt: null, rejection: null,
})
async function signedIn(page: Page) {
  await mockProfile(page)
  await page.addInitScript(user => sessionStorage.setItem('xiro.api-session.v1', JSON.stringify({ accessToken: 'flow-test-token', user })), account)
  await page.route('**/api/health', route => route.fulfill({ json: { demo: true, localAuth: false } }))
  await page.route('**/api/v1/me', route => route.fulfill({ json: account }))
  await page.route('**/api/v1/**/events', route => route.fulfill({ status: 404, json: { error: { code: 'TEST_STREAM', message: '테스트에서는 조회로 동기화해요.' } } }))
}

test('initial server connection can be retried without reloading the page', async ({ page }) => {
  let unavailable = true
  await page.route('**/api/health', route => unavailable
    ? route.fulfill({ status: 503, json: { error: { code: 'TEST_UNAVAILABLE', message: '서버 연결 테스트 실패' } } })
    : route.fulfill({ json: { demo: true, localAuth: false } }))
  await page.goto('/')
  await expect(page.getByRole('button', { name: '서버 다시 연결' })).toBeVisible()
  await expect(page.getByRole('button', { name: '이메일로 로그인하기' })).toBeDisabled()
  unavailable = false
  await page.getByRole('button', { name: '서버 다시 연결' }).click()
  await expect(page.getByRole('button', { name: '이메일로 로그인하기' })).toBeEnabled()
  await expect(page.getByText('서버 연결 테스트 실패', { exact: true })).toHaveCount(0)
})

test('store QR lists matching host parties and keeps ordinary ordering available when party lookup fails', async ({ page }) => {
  await signedIn(page)
  let releaseLookup!: () => void
  const lookupBlocked = new Promise<void>(resolve => { releaseLookup = resolve })
  let rejectLookup = true, connectedParty = '', connectionVersion = ''
  const first = { ...makeParty('first'), title: '첫 번째 모임' }, second = { ...makeParty('second', 'matching-store', 12), title: '두 번째 모임' }
  await page.route('**/api/v1/store-qr/flow-qr', route => route.fulfill({ json: { restaurantId: 'matching-store', restaurantName: '같은 매장', orderEnabled: true } }))
  await page.route('**/api/v1/me/parties?*', async route => {
    if (rejectLookup) {
      await lookupBlocked
      await route.fulfill({ status: 503, json: { error: { code: 'TEST_UNAVAILABLE', message: '파티 조회 실패' } } })
    } else await route.fulfill({ json: { items: [makeParty('다른 매장', 'other-store'), first, second, { ...makeParty('친구 파티'), myMemberId: 'friend-member' }], nextCursor: null } })
  })
  await page.route('**/api/v1/parties/*/store-connection', async route => {
    connectedParty = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-2)!)
    connectionVersion = route.request().headers()['if-match']
    await route.fulfill({ json: {} })
  })
  await page.route('**/api/v1/parties/second', route => route.fulfill({ json: { ...second, state: 'CANCELED' } }))
  await page.goto('/store/flow-qr')
  await expect(page.getByRole('button', { name: '일반 주문 시작', exact: true })).toBeEnabled()
  await expect(page.getByText('연결할 파티를 확인하는 중… 일반 주문도 시작할 수 있어요.')).toBeVisible()
  releaseLookup()
  await expect(page.getByRole('button', { name: '파티 목록 다시 불러오기' })).toBeVisible()
  await expect(page.getByRole('button', { name: '일반 주문 시작', exact: true })).toBeEnabled()
  rejectLookup = false
  await page.getByRole('button', { name: '파티 목록 다시 불러오기' }).click()
  const select = page.getByLabel('연결할 파티', { exact: true })
  await expect(select.locator('option')).toHaveText(['첫 번째 모임', '두 번째 모임'])
  await select.selectOption('second')
  await page.getByRole('button', { name: '두 번째 모임 파티에 연결' }).click()
  await expect.poll(() => connectedParty).toBe('second')
  expect(connectionVersion).toBe('"12"')
  await expect(page).toHaveURL(/\/party\//)
})

test('editing an order item preserves options and request after a failed save', async ({ page }) => {
  await signedIn(page)
  const order = makeOrder(), party = { ...makeParty('ordering-party'), state: 'ORDERING', orderId: order.id }
  let rejectSave = true
  await page.route('**/api/v1/orders/flow-order', route => route.fulfill({ json: order }))
  await page.route('**/api/v1/orders/flow-order/menus?*', route => route.fulfill({ json: { items: [menu], nextCursor: null } }))
  await page.route('**/api/v1/parties/ordering-party', route => route.fulfill({ json: party }))
  await page.route('**/api/v1/orders/flow-order/my-items/flow-item', async route => {
    if (rejectSave) { await route.fulfill({ status: 503, json: { error: { code: 'TEST_UNAVAILABLE', message: '주문 수정 저장 실패' } } }); return }
    const input = route.request().postDataJSON()
    expect(input).toEqual({ quantity: 3, options: [{ optionId: 'topping', valueId: 'olive' }], request: '소스 따로 주세요.' })
    order.version++
    Object.assign(order.members[0].items[0], { ...input, options: [{ ...input.options[0], optionName: '추가 토핑', valueName: '올리브', additionalPrice: 500 }], unitPrice: 9500, lineAmount: 28500 })
    order.totalAmount = 28500
    await route.fulfill({ json: order })
  })
  await page.goto('/order/flow-order')
  await page.getByRole('button', { name: '테스트 메뉴 옵션·요청 수정', exact: true }).click()
  const editor = page.getByRole('form', { name: '테스트 메뉴 주문 수정' })
  await expect(editor.getByLabel('요청사항', { exact: true })).toHaveValue('기존 요청')
  await editor.getByLabel('수량', { exact: true }).fill('3')
  await editor.getByLabel('올리브 (+500원)', { exact: true }).check()
  await editor.getByLabel('요청사항', { exact: true }).fill('소스 따로 주세요.')
  await editor.getByRole('button', { name: '변경 저장 · 28,500원', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('주문 수정 저장 실패')
  await expect(editor.getByLabel('수량', { exact: true })).toHaveValue('3')
  await expect(editor.getByLabel('올리브 (+500원)', { exact: true })).toBeChecked()
  await expect(editor.getByLabel('요청사항', { exact: true })).toHaveValue('소스 따로 주세요.')
  rejectSave = false
  await editor.getByRole('button', { name: '변경 저장 · 28,500원', exact: true }).click()
  await expect(editor).toHaveCount(0)
  await expect(page.getByText('테스트 메뉴 × 3', { exact: true })).toBeVisible()
  await expect(page.getByText('요청: 소스 따로 주세요.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '내 메뉴 선택 완료', exact: true })).toBeEnabled()
  await page.screenshot({ path: 'test-results/order-item-edited.png', fullPage: true })
})

test('direct order entry checks latest party state and version before host cancellation', async ({ page }) => {
  await signedIn(page)
  const order = makeOrder(), party: Party = { ...makeParty('ordering-party'), state: 'ORDERING', orderId: order.id }
  const deletedVersions: string[] = []
  await page.route('**/api/v1/orders/flow-order', route => route.fulfill({ json: order }))
  await page.route('**/api/v1/orders/flow-order/menus?*', route => route.fulfill({ json: { items: [menu], nextCursor: null } }))
  await page.route('**/api/v1/parties/ordering-party', async route => {
    if (route.request().method() === 'DELETE') {
      deletedVersions.push(route.request().headers()['if-match'])
      party.state = 'CANCELED'; order.status = 'CANCELED'
      await route.fulfill({ status: 204 })
    } else await route.fulfill({ json: party })
  })
  await page.goto('/order/flow-order')
  await expect(page.getByText('파티 관리', { exact: true })).toBeVisible()
  await page.getByText('파티 관리', { exact: true }).click()
  party.state = 'ORDER_SUBMITTED'
  await page.getByRole('button', { name: '파티 취소', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('주문 제출 전인 파티만 취소할 수 있어요.')
  expect(deletedVersions).toEqual([])
  party.state = 'ORDERING'; party.version = 13
  await page.reload()
  await page.getByText('파티 관리', { exact: true }).click()
  await page.getByRole('button', { name: '파티 취소', exact: true }).click()
  await expect(page.getByRole('heading', { name: '주문이 취소됐어요', exact: true })).toBeVisible()
  expect(deletedVersions).toEqual(['"13"'])
})
