import { defineConfig } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
process.env.XIRO_E2E_DB_PATH ||= join(mkdtempSync(join(tmpdir(), 'xiro-e2e-')), 'state.sqlite')
export default defineConfig({
  testDir: './e2e', timeout: 90000, expect: { timeout: 12000 }, workers: 1,
  use: { baseURL: 'http://localhost:5174', channel: 'chrome', viewport: { width: 390, height: 844 }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'npm run dev', url: 'http://localhost:5174/api/health', reuseExistingServer: false, timeout: 30000, env: { API_PORT: '3002', VITE_PORT: '5174', VITE_API_TARGET: 'http://127.0.0.1:3002', PUBLIC_ORIGIN: 'http://localhost:5174', DB_PATH: process.env.XIRO_E2E_DB_PATH, XIRO_DEMO_CATALOG_PATH: 'server/test/fixtures/catalog.json', VITE_DEMO_TEST_LOCATIONS: 'true', VITE_KAKAO_MAP_APP_KEY: '' } },
})
