import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createApp } from '../app.mjs'
import { provisionAccount } from '../local-auth.mjs'

const origins = ['https://www.xiro.my', 'https://xiro.my', 'https://xiro-dimigo-hackathon.vercel.app']
const demoCatalog = JSON.parse(readFileSync(new URL('./fixtures/catalog.json', import.meta.url), 'utf8'))
async function fixture(t) {
  const instance = createApp({ demo: true, demoCatalog, localAuth: true })
  const server = instance.app.listen(0, '0.0.0.0'); await new Promise(resolve => server.once('listening', resolve))
  t.after(async () => { instance.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) })
  return { ...instance, base: `http://127.0.0.1:${server.address().port}/api` }
}

test('all three frontend origins receive credentialed CORS and preflight support for API and SSE headers', async t => {
  const { base } = await fixture(t)
  for (const origin of origins) {
    const preflight = await fetch(`${base}/v1/parties`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type,idempotency-key,if-match,last-event-id' } })
    assert.equal(preflight.status, 204)
    assert.equal(preflight.headers.get('access-control-allow-origin'), origin)
    assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true')
    const headers = preflight.headers.get('access-control-allow-headers').toLowerCase()
    for (const name of ['authorization', 'content-type', 'idempotency-key', 'if-match', 'last-event-id']) assert.ok(headers.includes(name))
    const health = await fetch(`${base}/health`, { headers: { Origin: origin } })
    assert.equal(health.status, 200)
    assert.equal(health.headers.get('access-control-allow-origin'), origin)
    assert.ok(health.headers.get('access-control-expose-headers').includes('ETag'))
    const unauthorized = await fetch(`${base}/v1/me`, { headers: { Origin: origin } })
    assert.equal(unauthorized.status, 401)
    assert.equal(unauthorized.headers.get('access-control-allow-origin'), origin)
  }
  for (const origin of ['https://evil.example', 'https://xiro.my.evil.example', 'null']) {
    const response = await fetch(`${base}/health`, { headers: { Origin: origin } })
    assert.equal(response.status, 403)
    assert.equal(response.headers.get('access-control-allow-origin'), null)
  }
})

test('deployment origins also pass demo and local login redirect validation', async t => {
  const { base, store } = await fixture(t)
  provisionAccount(store, { email: 'cors@example.com', displayName: 'CORS 확인', password: 'cors-test-password-2026' })
  for (const origin of origins) {
    const headers = { Origin: origin, 'Content-Type': 'application/json' }, redirectUri = `${origin}/`
    const issued = await fetch(`${base}/dev/login-codes`, { method: 'POST', headers, body: JSON.stringify({ displayName: 'CORS 손님', merchant: false, redirectUri }) })
    assert.equal(issued.status, 200)
    const { authorizationCode } = await issued.json()
    const login = await fetch(`${base}/v1/auth/login`, { method: 'POST', headers, body: JSON.stringify({ provider: 'demo', authorizationCode, redirectUri }) })
    assert.equal(login.status, 200)
    const session = await login.json()
    const me = await fetch(`${base}/v1/me`, { headers: { Origin: origin, Authorization: `Bearer ${session.accessToken}` } })
    assert.equal(me.status, 200)
    const local = await fetch(`${base}/v1/auth/local-codes`, { method: 'POST', headers, body: JSON.stringify({ email: 'cors@example.com', password: 'cors-test-password-2026', redirectUri }) })
    assert.equal(local.status, 200)
  }
})
