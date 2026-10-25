// getRandomValues also works on HTTP LAN origins, where randomUUID is absent.
// 32 random bytes provide 256 bits of entropy for idempotency keys and IDs.
export function randomId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('')
}
