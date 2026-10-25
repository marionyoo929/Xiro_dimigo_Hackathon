import { emitKeypressEvents } from 'node:readline'
import { Store } from '../server/store.mjs'
import { provisionAccount } from '../server/local-auth.mjs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const [email, displayName] = process.argv.slice(2)
if (!email || !displayName) { console.error('Usage: npm run create:user -- email displayName [--merchant]'); process.exit(1) }
let password = process.env.XIRO_ACCOUNT_PASSWORD
delete process.env.XIRO_ACCOUNT_PASSWORD
if (!password) {
  if (!process.stdin.isTTY) throw new Error('Interactive terminal or XIRO_ACCOUNT_PASSWORD is required')
  process.stdout.write('비밀번호 (12자 이상, 입력 내용 숨김): ')
  emitKeypressEvents(process.stdin); process.stdin.setRawMode(true); process.stdin.resume()
  password = await new Promise((resolve, reject) => {
    let value = ''
    const listener = (text, key) => {
      if (key?.ctrl && key.name === 'c') { cleanup(); reject(new Error('취소됨')) }
      else if (key?.name === 'return') { cleanup(); resolve(value) }
      else if (key?.name === 'backspace') value = value.slice(0, -1)
      else if (text && !key?.ctrl) value += text
    }
    const cleanup = () => { process.stdin.off('keypress', listener); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n') }
    process.stdin.on('keypress', listener)
  })
}
const store = new Store(process.env.DB_PATH || resolve(fileURLToPath(new URL('../', import.meta.url)), 'data/xiro.sqlite'))
try { const user = provisionAccount(store, { email, displayName, password, merchant: process.argv.includes('--merchant') }); console.log('계정 생성 완료:', user.displayName, user.roles.join(', ')) }
finally { password = undefined; store.close() }
