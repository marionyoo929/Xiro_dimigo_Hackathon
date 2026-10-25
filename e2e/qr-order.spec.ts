import { test, expect } from '@playwright/test'
import { completeProfile } from './helpers/profile'

test('merchant registers a store and option menu; QR guest orders and receives rejection detail', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 740 } }), guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const owner = await context.newPage(), guest = await guestContext.newPage(), storeName = `QR 검증 매장 ${Date.now()}`
  await owner.goto(baseURL!); await owner.getByRole('button', { name: '이메일로 로그인하기' }).click(); await owner.getByRole('button', { name: '사장님 시연 시작' }).click(); await owner.getByRole('button', { name: '＋ 새 매장 등록' }).click()
  await owner.getByLabel('매장 이름', { exact: true }).fill(storeName); await owner.getByLabel('주소', { exact: true }).fill('서울특별시 중구 테스트 주소'); await owner.getByLabel('전화번호', { exact: true }).fill('02-000-0000')
  await owner.getByRole('button', { name: '매장 저장', exact: true }).click(); await expect(owner.getByRole('heading', { name: storeName })).toBeVisible()
  await owner.getByRole('button', { name: '메뉴', exact: true }).click(); await owner.getByRole('button', { name: '＋ 메뉴 등록' }).click()
  await owner.getByLabel('메뉴명', { exact: true }).fill('신선 샐러드'); await owner.getByLabel('설명', { exact: true }).fill('채소 샐러드'); await owner.getByLabel('가격', { exact: true }).fill('9000'); await owner.getByLabel('음식 카테고리', { exact: true }).selectOption('salad'); await owner.getByLabel('재료·제한 정보 상태').selectOption('COMPLETE')
  await owner.getByText('선택 옵션 0개', { exact: true }).click(); await owner.getByRole('button', { name: '옵션 그룹 추가' }).click(); await owner.getByLabel('옵션명', { exact: true }).fill('추가 토핑'); await owner.getByLabel('선택지', { exact: true }).fill('올리브'); await owner.getByLabel('추가금', { exact: true }).fill('500'); await owner.getByRole('button', { name: '메뉴 저장', exact: true }).click()
  await expect(owner.getByRole('heading', { name: '신선 샐러드', exact: true })).toBeVisible()
  await owner.getByRole('button', { name: 'QR', exact: true }).click(); await owner.getByRole('button', { name: 'QR 발급', exact: true }).click(); const url = await owner.getByLabel('매장 QR 링크', { exact: true }).inputValue()
  await guest.goto(url); await guest.getByLabel('닉네임', { exact: true }).fill('방문 손님'); await guest.getByRole('button', { name: '일반 주문 시작', exact: true }).click(); await completeProfile(guest); await expect(guest.getByRole('heading', { name: '각자 메뉴를 골라요' })).toBeVisible()
  await guest.getByText('수량 · 옵션 · 요청사항', { exact: true }).click(); await guest.getByLabel('수량', { exact: true }).fill('2'); await guest.getByLabel('올리브 (+500원)').check(); await guest.getByRole('button', { name: '담기 · 19,000원', exact: true }).click(); await guest.getByRole('button', { name: '내 메뉴 선택 완료', exact: true }).click(); await guest.getByRole('button', { name: '식당에 주문 제출', exact: true }).click()
  await owner.getByRole('button', { name: '주문', exact: true }).click(); await expect(owner.getByText('합계', { exact: true })).toBeVisible(); await owner.getByText('주문 거절', { exact: true }).click(); await owner.getByLabel('손님에게 전달할 설명').fill('준비된 재료가 모두 소진됐어요.'); await owner.getByRole('button', { name: '전체 주문 거절', exact: true }).click()
  await expect(guest.getByRole('heading', { name: '식당이 주문을 거절했어요' })).toBeVisible(); await expect(guest.getByText('준비된 재료가 모두 소진됐어요.', { exact: true })).toBeVisible()
  for (const page of [owner, guest]) expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  await guest.screenshot({ path: 'test-results/qr-order-rejected.png', fullPage: true })
  await Promise.all([context.close(), guestContext.close()])
})
