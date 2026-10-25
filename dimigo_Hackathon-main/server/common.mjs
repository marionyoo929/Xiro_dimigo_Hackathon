import { randomBytes, randomUUID, createHash } from 'node:crypto'
export const id = () => randomUUID()
export const secret = () => randomBytes(32).toString('base64url')
export const hash = value => createHash('sha256').update(value).digest('hex')
export const now = () => new Date().toISOString()
export const DAY = 86400000
export class ApiError extends Error {
  constructor(status, code, message, details = {}) { super(message); Object.assign(this, { status, code, details }) }
}
export function fail(status, code, message, details) { throw new ApiError(status, code, message, details) }
export const missing = () => fail(404, 'RESOURCE_NOT_FOUND', '정보를 찾을 수 없어요.')
export function match(req, version) {
  if (!req.get('If-Match')) fail(428, 'PRECONDITION_REQUIRED', '최신 버전 정보가 필요해요.')
  if (req.get('If-Match') !== `"${version}"`) fail(412, 'VERSION_CONFLICT', '다른 변경이 있어요. 최신 정보를 확인하고 다시 시도해 주세요.')
}
export function state(party, ...allowed) {
  if (!allowed.includes(party.state)) fail(409, 'INVALID_PARTY_STATE', '현재 단계에서는 이 작업을 할 수 없어요.', { currentState: party.state, allowedStates: allowed })
}
export function member(party, user) { return party.members.find(m => m.userId === user.id) || missing() }
export function host(party, user) { if (member(party, user).role !== 'HOST') fail(403, 'HOST_PERMISSION_REQUIRED', '방장만 할 수 있어요.') }
export function distance(a, b) {
  const rad = n => n * Math.PI / 180
  const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)))
}
export const publicUser = ({ id, displayName, principalType, roles }) => ({ id, displayName, principalType, roles })
export const publicRestaurant = ({ ownerId: _owner, ...value }) => value
export const publicMenu = ({ deleted: _deleted, ...value }) => value
export function publicMember(m) {
  return { id: m.id, displayName: m.displayName, role: m.role, connectionStatus: m.online ? 'ONLINE' : 'OFFLINE', restrictionConfirmed: m.restrictionConfirmed,
    categoryReviewStatus: m.categoryComplete ? 'COMPLETED' : m.categoryViews?.length ? 'IN_PROGRESS' : 'NOT_STARTED',
    restaurantReviewStatus: m.restaurantComplete ? 'COMPLETED' : m.restaurantViews?.length ? 'IN_PROGRESS' : 'NOT_STARTED' }
}
export function publicSet(set) { return { id: set.id, kind: set.kind, revision: set.revision, totalCount: set.items.length, activeCount: set.items.filter(c => !c.eliminators.length).length, finalized: set.finalized } }
export function publicParty(party, user) {
  const { members, sets, restrictionSnapshot: _private, connectedRestaurantId: _connected, ...rest } = party
  return { ...rest, myMemberId: member(party, user).id, memberCount: members.length, members: members.map(publicMember), candidateSets: sets.map(publicSet) }
}
export function publicCandidate(c, me) { const { eliminators, views: _views, ...value } = c; return { ...value, status: eliminators.length ? 'ELIMINATED' : 'ACTIVE', viewedByMe: me[`${c.category ? 'category' : 'restaurant'}Views`].includes(c.id), eliminatedByMe: eliminators.includes(me.id) } }
export function publicOrder(order, user) {
  const { members, restrictionSnapshot: _private, ...value } = order
  return { ...value, myMemberId: members.find(m => m.userId === user.id)?.memberId || null, members: members.map(({ userId: _user, ...m }) => m) }
}
export function newMember(user, role = 'MEMBER') { return { id: id(), userId: user.id, displayName: user.displayName, role, restrictionConfirmed: false, restrictionRevision: null, categoryViews: [], restaurantViews: [], categoryComplete: false, restaurantComplete: false } }
