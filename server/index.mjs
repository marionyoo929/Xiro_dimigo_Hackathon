import express from 'express'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { createApp } from './app.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
// This hackathon build uses the same demo login and sample data in every environment.
const demo = true
const demoCatalog = demo && process.env.XIRO_DEMO_CATALOG_PATH ? JSON.parse(readFileSync(resolve(root, process.env.XIRO_DEMO_CATALOG_PATH), 'utf8')) : undefined
const instance = createApp({ dbPath: process.env.DB_PATH || resolve(root, demo ? 'data/demo.sqlite' : 'data/xiro.sqlite'), demo, demoCatalog, localAuth: process.env.LOCAL_AUTH_ENABLED === 'true', origin: process.env.PUBLIC_ORIGIN || 'http://localhost:5173', maxMembers: Number(process.env.MAX_MEMBERS || 8) })
if (!demo) {
  instance.app.use(express.static(resolve(root, 'dist'), { etag: true, maxAge: '1h' }))
  instance.app.get('/{*path}', (_req, res) => res.sendFile(resolve(root, 'dist/index.html')))
}
const server = instance.app.listen(Number(process.env.API_PORT || 3001), process.env.API_HOST || '0.0.0.0', () => console.log(`XIRO API http://${process.env.API_HOST || '0.0.0.0'}:${server.address().port}${demo ? ' (explicit demo mode)' : ''}`))
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { instance.close(); server.close(() => process.exit(0)) })
