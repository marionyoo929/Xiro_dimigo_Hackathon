import { DatabaseSync, backup } from 'node:sqlite'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Store } from '../server/store.mjs'
import { Service } from '../server/service.mjs'
import { legacyRestaurantIds, replaceDemoCatalog, seedReference, validateDemoCatalog } from '../server/seed.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))

export async function replaceCatalogFile({ dbPath, catalog, retireIds = legacyRestaurantIds, updateRestaurantIds = [], backupDirectory = resolve(root, 'backups') }) {
  validateDemoCatalog(catalog)
  if (!catalog.revision) throw new Error('교체 카탈로그 revision이 필요합니다.')
  if (!existsSync(dbPath)) throw new Error('기존 SQLite 파일을 찾을 수 없습니다. DB 경로를 확인하세요.')
  mkdirSync(backupDirectory, { recursive: true })
  const backupPath = resolve(backupDirectory, `catalog-before-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}.sqlite`)
  const source = new DatabaseSync(dbPath, { readOnly: true })
  // SQLite's online backup includes committed WAL pages and never copies a
  // partially-written main database file.
  try { await backup(source, backupPath) } finally { source.close() }
  const store = new Store(dbPath)
  try {
    const service = new Service(store)
    const result = store.transaction(() => {
      seedReference(service, catalog)
      return replaceDemoCatalog(service, catalog, { retireIds, updateRestaurantIds })
    })
    return { ...result, backupPath, activeRestaurants: store.all('restaurant').filter(r => !r.catalogRetired).length }
  } finally { store.close() }
}

async function main() {
  const args = process.argv.slice(2), values = new Map(), flags = new Set()
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--apply') flags.add(args[i])
    else if (['--db', '--catalog', '--retire-ids', '--update-restaurant-ids', '--backup-directory'].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--')) values.set(args[i], args[++i])
    else throw new Error(`알 수 없거나 값이 빠진 옵션: ${args[i]}`)
  }
  const dbPath = resolve(root, values.get('--db') || process.env.DB_PATH || 'data/demo.sqlite')
  const catalogPath = resolve(root, values.get('--catalog') || 'server/demo-catalog.json')
  const catalog = validateDemoCatalog(JSON.parse(readFileSync(catalogPath, 'utf8')))
  if (!values.has('--retire-ids')) throw new Error('--retire-ids에 목록에서 제외할 기존 식당 ID를 쉼표로 구분하여 명시하세요.')
  const retireIds = [...new Set(values.get('--retire-ids').split(',').map(value => value.trim()).filter(Boolean))]
  const updateRestaurantIds = [...new Set((values.get('--update-restaurant-ids') || '').split(',').map(value => value.trim()).filter(Boolean))]
  if (!catalog.revision || !existsSync(dbPath)) throw new Error('카탈로그 revision과 기존 SQLite 경로를 확인하세요.')
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const restaurants = db.prepare('SELECT body FROM resources WHERE kind=?').all('restaurant').map(row => JSON.parse(row.body))
    if (retireIds.some(id => !restaurants.some(r => r.id === id))) throw new Error('은퇴 목록에 존재하지 않는 식당 ID가 있습니다.')
    if (catalog.restaurants.some(r => retireIds.includes(r.id))) throw new Error('추가할 식당과 은퇴할 식당 ID가 겹칩니다.')
    if (updateRestaurantIds.some(id => retireIds.includes(id) || !restaurants.some(r => r.id === id) || !catalog.restaurants.some(r => r.id === id))) throw new Error('보정할 식당은 기존 DB와 입력 카탈로그 양쪽에 존재해야 하며 은퇴 목록과 겹칠 수 없습니다.')
    console.log(JSON.stringify({ dbPath, revision: catalog.revision, retireIds, updateRestaurantIds, incomingRestaurants: catalog.restaurants.length, incomingMenus: catalog.menus.length, apply: flags.has('--apply') }, null, 2))
  } finally { db.close() }
  if (!flags.has('--apply')) { console.log('검토만 완료했습니다. --apply를 추가하면 백업 후 카탈로그를 교체합니다.'); return }
  const result = await replaceCatalogFile({ dbPath, catalog, retireIds, updateRestaurantIds, backupDirectory: values.has('--backup-directory') ? resolve(root, values.get('--backup-directory')) : undefined })
  console.log(JSON.stringify(result, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1 })
