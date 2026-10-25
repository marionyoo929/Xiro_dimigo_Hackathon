import { DatabaseSync, backup } from 'node:sqlite'
import { mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
const source = process.env.DB_PATH || resolve(root, 'data/xiro.sqlite')
if (!existsSync(source)) throw new Error('DB_PATH에 백업할 기존 SQLite 파일을 지정하세요.')
const directory = resolve(root, 'backups'); mkdirSync(directory, { recursive: true })
const destination = resolve(directory, `xiro-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`)
if (existsSync(destination)) throw new Error('같은 이름의 백업이 존재합니다.')
const db = new DatabaseSync(source, { readOnly: true })
try { await backup(db, destination); console.log('백업 완료:', destination) }
finally { db.close() }
