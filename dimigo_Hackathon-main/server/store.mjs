import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

// Small MVP aggregates live in SQLite JSON rows. All commands use one immediate
// transaction, including idempotency results and the durable event outbox.
export class Store {
  constructor(path = ':memory:') {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.db = new DatabaseSync(path)
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS resources (
        kind TEXT NOT NULL, id TEXT NOT NULL, unique_key TEXT, body TEXT NOT NULL,
        PRIMARY KEY(kind,id));
      CREATE UNIQUE INDEX IF NOT EXISTS resource_unique ON resources(kind,unique_key) WHERE unique_key IS NOT NULL;
      CREATE TABLE IF NOT EXISTS outbox (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL,
        scope TEXT NOT NULL, audience TEXT, created_at INTEGER NOT NULL, body TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS outbox_scope ON outbox(scope,seq);
      PRAGMA user_version=1;`)
  }
  get(kind, id) { const row = this.db.prepare('SELECT body FROM resources WHERE kind=? AND id=?').get(kind, id); return row ? JSON.parse(row.body) : null }
  all(kind) { return this.db.prepare('SELECT body FROM resources WHERE kind=? ORDER BY rowid').all(kind).map(row => JSON.parse(row.body)) }
  put(kind, value, uniqueKey = null) { this.db.prepare('INSERT INTO resources VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body,unique_key=excluded.unique_key').run(kind, value.id, uniqueKey, JSON.stringify(value)); return value }
  delete(kind, id) { this.db.prepare('DELETE FROM resources WHERE kind=? AND id=?').run(kind, id) }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE')
    try { const value = fn(); this.db.exec('COMMIT'); return value }
    catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  close() { this.db.close() }
}
