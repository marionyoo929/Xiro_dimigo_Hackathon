import { test, expect, type Page } from '@playwright/test'
import QRCode from 'qrcode'
import { mockProfile } from './helpers/profile'

async function fakeCamera(page: Page, contents: string) {
  await mockProfile(page)
  const frame = await QRCode.toDataURL(contents, { width: 512, margin: 4 })
  await page.addInitScript(data => {
    const user = { id: 'camera-user', displayName: '카메라 검증', principalType: 'USER', roles: ['USER'] }
    sessionStorage.setItem('xiro.api-session.v1', JSON.stringify({ accessToken: 'camera-test-session', user }))
    navigator.mediaDevices.getUserMedia = async constraints => {
      document.documentElement.dataset.cameraConstraints = JSON.stringify(constraints)
      const image = new Image()
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('fake camera frame')); image.src = data })
      const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512
      const context = canvas.getContext('2d')!
      context.drawImage(image, 0, 0)
      const stream = canvas.captureStream(10), track = stream.getVideoTracks()[0]
      const interval = setInterval(() => context.drawImage(image, 0, 0), 100)
      document.documentElement.dataset.activeCameras = String(Number(document.documentElement.dataset.activeCameras || 0) + 1)
      const originalStop = track.stop.bind(track)
      let stopped = false
      track.stop = () => {
        if (!stopped) { stopped = true; clearInterval(interval); originalStop(); document.documentElement.dataset.activeCameras = String(Number(document.documentElement.dataset.activeCameras) - 1) }
      }
      return stream
    }
  }, frame)
  await page.route('**/api/health', route => route.fulfill({ json: { demo: true, localAuth: false } }))
  await page.route('**/api/v1/me', route => route.fulfill({ json: { id: 'camera-user', displayName: '카메라 검증', principalType: 'USER', roles: ['USER'] } }))
  await page.route('**/api/v1/me/parties?*', route => route.fulfill({ json: { items: [], nextCursor: null } }))
}

test('a QR in a camera video frame opens the store and releases every camera track', async ({ page }) => {
  await fakeCamera(page, 'https://xiro.example/store/camera-store-token')
  await page.route('**/api/v1/store-qr/camera-store-token', route => route.fulfill({ json: { restaurantId: 'camera-store', restaurantName: '카메라 테스트 매장', orderEnabled: true } }))
  await page.goto('/')
  await page.getByRole('button', { name: '매장 QR 스캔', exact: true }).click()
  await expect(page.getByRole('heading', { name: '카메라 테스트 매장', exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/store\/camera-store-token$/)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('html')).toHaveAttribute('data-active-cameras', '0')
  const constraints = await page.locator('html').getAttribute('data-camera-constraints')
  expect(JSON.parse(constraints!)).toMatchObject({ audio: false, video: { facingMode: { ideal: 'environment' } } })
})

test('an unrelated QR stays in the scanner and closing it releases the camera', async ({ page }) => {
  await fakeCamera(page, 'https://example.com/unrelated-qr')
  await page.goto('/')
  await page.getByRole('button', { name: '매장 QR 스캔', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('시로 매장 QR이 아니에요.')
  await expect(page.locator('html')).toHaveAttribute('data-active-cameras', '1')
  await page.getByRole('button', { name: '스캔 닫기', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('html')).toHaveAttribute('data-active-cameras', '0')
})
