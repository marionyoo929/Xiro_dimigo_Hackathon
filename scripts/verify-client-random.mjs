import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { webcrypto } from 'node:crypto'
import ts from 'typescript'
const source = await readFile(new URL('../src/lib/randomId.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText
Object.defineProperty(globalThis, 'crypto', { value: { getRandomValues: array => webcrypto.getRandomValues(array) }, configurable: true })
assert.equal(crypto.randomUUID, undefined)
const { randomId } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
const ids = Array.from({ length: 100 }, randomId)
assert.equal(new Set(ids).size, ids.length)
assert.ok(ids.every(id => /^[0-9a-f]{64}$/.test(id)))
console.log('PASS: browser IDs use 256-bit secure random bytes without randomUUID (HTTP LAN compatible)')
