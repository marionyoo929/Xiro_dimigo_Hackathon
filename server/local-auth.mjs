import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { fail, hash, id, secret } from './common.mjs'

export function passwordRecord(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) fail(422, 'VALIDATION_ERROR', '비밀번호는 12~256자로 입력해 주세요.')
  const salt = randomBytes(16).toString('hex')
  return { salt, digest: scryptSync(password, salt, 64).toString('hex') }
}
export function verifyPassword(password, record) {
  const digest = scryptSync(password, record?.salt || 'invalid-account-salt', 64)
  return record ? timingSafeEqual(digest, Buffer.from(record.digest, 'hex')) : false
}
export function createLocalCode(service, body) {
  if (!body || Array.isArray(body) || typeof body !== 'object') fail(422, 'VALIDATION_ERROR', '로그인 정보를 확인해 주세요.')
  if (Object.keys(body).some(k => !['email', 'password', 'redirectUri'].includes(k)) || typeof body.email !== 'string' || typeof body.password !== 'string' || body.password.length > 256 || typeof body.redirectUri !== 'string') fail(422, 'VALIDATION_ERROR', '이메일과 비밀번호를 확인해 주세요.')
  if (![...service.options.allowedOrigins].some(origin => body.redirectUri === `${origin}/`)) fail(422, 'VALIDATION_ERROR', '허용되지 않은 로그인 주소예요.')
  const account = service.store.get('credential', hash(body.email.trim().toLowerCase()))
  if (!verifyPassword(body.password, account?.password)) fail(401, 'UNAUTHORIZED', '이메일 또는 비밀번호를 확인해 주세요.')
  const code = secret(); service.put('login-code', { id: hash(code), userId: account.userId, provider: 'local', redirectUri: body.redirectUri, expires: Date.now() + 60000 })
  return { authorizationCode: code }
}
export function provisionAccount(store, { email, displayName, password, merchant = false }) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !displayName.trim() || displayName.length > 30) throw new Error('이메일과 표시 이름을 확인하세요.')
  return store.transaction(() => {
    const key = hash(email.trim().toLowerCase())
    if (store.get('credential', key)) throw new Error('이미 등록된 이메일입니다.')
    const user = { id: id(), displayName: displayName.trim(), principalType: 'USER', roles: merchant ? ['USER', 'MERCHANT'] : ['USER'] }
    store.put('user', user); store.put('credential', { id: key, userId: user.id, password: passwordRecord(password) })
    return user
  })
}
