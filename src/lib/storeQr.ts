export function storeQrToken(value: string): string {
  const text = value.trim()
  if (text.length > 2048) throw new Error('시로 매장 QR 코드를 비춰 주세요.')
  if (/^[A-Za-z0-9_-]{16,256}$/.test(text)) return text
  try {
    const url = new URL(text, window.location.origin)
    const match = /^\/store\/([^/]+)\/?$/.exec(url.pathname)
    const token = match ? decodeURIComponent(match[1]) : ''
    if (['http:', 'https:'].includes(url.protocol) && /^[A-Za-z0-9_-]{1,256}$/.test(token)) return token
  } catch { /* Invalid URLs and encoded tokens are shown as an unreadable QR. */ }
  throw new Error('시로 매장 QR이 아니에요. 매장에 비치된 주문 QR을 비춰 주세요.')
}
