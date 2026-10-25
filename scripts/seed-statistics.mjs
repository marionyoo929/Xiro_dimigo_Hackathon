import { DatabaseSync, backup } from 'node:sqlite'
import { existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Store } from '../server/store.mjs'
import { Service } from '../server/service.mjs'
import { seedStatistics } from '../server/demo-stats.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
async function main() {
  const args = process.argv.slice(2)
  if (args.some(arg => arg !== '--apply')) throw new Error('지원하는 옵션: --apply')
  // Intentionally target only the shipped demo DB, never an operating DB_PATH.
  const dbPath = resolve(root, 'data/demo.sqlite')
  if (!existsSync(dbPath)) throw new Error('data/demo.sqlite 파일이 필요합니다.')
  const apply = args.includes('--apply')
  let backupPath = null
  if (apply) {
    mkdirSync(resolve(root, 'backups'), { recursive: true })
    backupPath = resolve(root, 'backups', `statistics-before-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}.sqlite`)
    const source = new DatabaseSync(dbPath, { readOnly: true })
    try { await backup(source, backupPath) } finally { source.close() }
  }
  const store = new Store(dbPath)
  try {
    store.db.exec('BEGIN IMMEDIATE')
    try {
      const result = seedStatistics(new Service(store, { demo: true }))
      store.db.exec(apply ? 'COMMIT' : 'ROLLBACK')
      console.log(JSON.stringify({ ...result, applied: apply, backupPath }, null, 2))
    } catch (e) { store.db.exec('ROLLBACK'); throw e }
  } finally { store.close() }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
