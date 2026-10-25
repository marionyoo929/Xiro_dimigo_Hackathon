import { test, expect, type Page } from '@playwright/test'

test('two browsers share elimination, selection, group order and merchant acceptance', async ({ browser, baseURL }) => {
  const hostContext = await browser.newContext({ viewport: { width: 390, height: 844 } }), friendContext = await browser.newContext({ viewport: { width: 390, height: 844 } }), merchantContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const host = await hostContext.newPage(), friend = await friendContext.newPage(), merchant = await merchantContext.newPage()
  const errors: string[] = []
  for (const page of [host, friend, merchant]) {
    page.on('pageerror', e => errors.push(e.message))
    // The shared-state flow is independent from external Kakao SDK availability.
    await page.route('https://dapi.kakao.com/**', route => route.abort())
  }
  const login = async (page: Page, name: string) => { await page.goto(baseURL!); await page.getByLabel('닉네임', { exact: true }).fill(name); await page.getByRole('button', { name: '닉네임으로 시연 시작' }).click(); await expect(page.getByRole('button', { name: '＋ 파티 만들기' })).toBeVisible() }
  await login(host, '브라우저 방장')
  await host.getByRole('button', { name: '＋ 파티 만들기' }).click()
  await host.getByRole('button', { name: '서울시청', exact: true }).click()
  await expect(host.getByText(/주변 등록 식당 3곳/)).toBeVisible()
  await host.getByRole('button', { name: '이 장소로 파티 만들기' }).click()
  await expect(host.getByRole('heading', { name: '함께 먹을 준비됐나요?' })).toBeVisible()
  await host.getByRole('button', { name: '초대 링크 복사' }).click()
  const invite = await host.getByLabel('초대 링크', { exact: true }).inputValue()
  await friend.goto(invite); await friend.getByLabel('닉네임', { exact: true }).fill('초대 친구'); await friend.getByRole('button', { name: '게스트로 참여' }).click()
  await expect(host.getByText('참가자 2/8')).toBeVisible()
  for (const page of [host, friend]) await page.getByRole('button', { name: '최신 식사 제한 확인' }).click()
  await expect(host.getByRole('button', { name: '음식 후보 생성' })).toBeEnabled(); await host.getByRole('button', { name: '음식 후보 생성' }).click()
  await expect(host.getByRole('heading', { name: /음식 확인/ })).toBeVisible()
  const first = host.locator('.candidate-card').first(), name = await first.getByRole('heading').innerText()
  await first.getByRole('button', { name: '소거', exact: true }).click()
  const friendCard = friend.locator('.candidate-card').filter({ has: friend.getByRole('heading', { name, exact: true }) })
  await expect(friendCard.getByText('공동 소거된 후보')).toBeVisible(); await friendCard.getByRole('button', { name: '소거', exact: true }).click()
  await first.getByRole('button', { name: '내 소거 취소' }).click(); await expect(first.getByText('공동 소거된 후보')).toBeVisible()
  await friendCard.getByRole('button', { name: '내 소거 취소' }).click(); await expect(first.getByText('남은 후보')).toBeVisible()
  async function review(page: Page, label: string) {
    const cards = page.locator('.candidate-card')
    for (let i = 0; i < await cards.count(); i++) { await cards.nth(i).scrollIntoViewIfNeeded(); await expect(cards.nth(i).getByRole('button', { name: '확인', exact: true })).toHaveCount(0) }
    const done = page.getByRole('button', { name: `${label} 검토 완료`, exact: true }); await expect(done).toBeEnabled(); await done.click()
  }
  await review(host, '음식'); await review(friend, '음식')
  await expect(host.getByRole('button', { name: '음식 후보 확정' })).toBeEnabled(); await host.getByRole('button', { name: '음식 후보 확정' }).click()
  await host.getByRole('button', { name: '식당 후보 생성' }).click(); await expect(host.getByRole('heading', { name: /식당 확인/ })).toBeVisible()
  await review(host, '식당'); await review(friend, '식당')
  await expect(host.getByRole('button', { name: '식당 후보 확정' })).toBeEnabled(); await host.getByRole('button', { name: '식당 후보 확정' }).click()
  const chosen = await host.locator('.summary-card').first().getByRole('heading').innerText()
  await host.getByRole('button', { name: '이 식당 선택' }).first().click(); await expect(host.getByRole('heading', { name: '방문할 식당을 정했어요!' })).toBeVisible()
  await merchant.goto(baseURL!); await merchant.getByRole('button', { name: '사장님 시연 시작' }).click(); await merchant.getByLabel('내 매장', { exact: true }).selectOption({ label: chosen })
  await merchant.getByRole('button', { name: 'QR', exact: true }).click(); await merchant.getByRole('button', { name: 'QR 발급', exact: true }).click(); const qr = await merchant.getByLabel('매장 QR 링크', { exact: true }).last().inputValue()
  await host.getByLabel('매장 QR 링크 또는 토큰').fill(qr); await host.getByRole('button', { name: '매장 연결 · 주문 시작' }).click()
  for (const page of [host, friend]) {
    await expect(page.getByRole('heading', { name: '각자 메뉴를 골라요' })).toBeVisible()
    if (page === friend) await expect(page.getByText('1/2명 선택 완료 · 제출 후 수정할 수 없어요.', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: /^담기 ·/ }).first().click(); await page.getByRole('button', { name: '내 메뉴 선택 완료', exact: true }).click()
  }
  await expect(host.getByRole('button', { name: '식당에 주문 제출' })).toBeEnabled(); await host.getByRole('button', { name: '식당에 주문 제출' }).click()
  await merchant.getByRole('button', { name: '주문', exact: true }).click(); await expect(merchant.getByRole('button', { name: '전체 주문 수락' }).last()).toBeVisible(); await merchant.getByRole('button', { name: '전체 주문 수락' }).last().click()
  for (const page of [host, friend]) await expect(page.getByRole('heading', { name: '식당 주문 수락 완료' })).toBeVisible()
  await merchant.getByRole('button', { name: '수수료', exact: true }).click(); await expect(merchant.getByRole('heading', { name: '계산 대기' }).last()).toBeVisible()
  for (const page of [host, friend, merchant]) expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  await host.screenshot({ path: 'test-results/group-order-complete.png', fullPage: true }); await merchant.screenshot({ path: 'test-results/merchant-commission.png', fullPage: true })
  expect(errors).toEqual([])
  await Promise.all([hostContext.close(), friendContext.close(), merchantContext.close()])
})
