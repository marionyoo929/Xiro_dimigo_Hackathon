const separator = '\n만날 위치: '
export function splitMeetingAddress(address = '') {
  const index = address.indexOf(separator)
  return index < 0 ? { address, detail: '' } : { address: address.slice(0, index), detail: address.slice(index + separator.length) }
}
// Keep the existing Location contract and old addresses readable.
export function meetingAddress(address: string, detail: string) {
  const base = splitMeetingAddress(address).address.trim()
  return detail.trim() ? `${base}${separator}${detail.trim()}` : base
}
export function localDateTime(iso?: string | null) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
