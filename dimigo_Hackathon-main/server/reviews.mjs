import { fail, host, id, match, member, now, publicCandidate, publicMenu, publicParty, publicSet, state, distance } from './common.mjs'
import { conflict, nearbyMenus } from './catalog.mjs'

function setFor(party, kind) { return party.sets.find(s => s.kind === kind.toUpperCase()) || fail(409, 'INVALID_PARTY_STATE', '아직 후보가 생성되지 않았어요.') }
function progress(party, me, kind) {
  const set = setFor(party, kind), completed = party.members.filter(m => m[`${kind}Complete`]).length
  return { candidateSetId: set.id, viewedCount: me[`${kind}Views`].length, totalCount: set.items.length, reviewCompleted: me[`${kind}Complete`], partyCompletedMemberCount: completed, partyMemberCount: party.members.length, allMembersCompleted: completed === party.members.length }
}
function candidate(party, req, kind) {
  const set = setFor(party, kind), c = set.items.find(c => c.id === req.params.candidateId)
  if (!c) fail(404, 'CANDIDATE_NOT_FOUND', '후보를 찾을 수 없어요.')
  return { set, c, me: member(party, req.user) }
}
function generate(req, kind) {
  const p = this.party(req.params.partyId, req.user); host(p, req.user)
  state(p, kind === 'category' ? 'WAITING' : 'CATEGORY_FINALIZED')
  this.requireActiveGuests(p)
  if (kind === 'category') {
    if (p.members.some(m => !m.restrictionConfirmed || m.restrictionRevision !== this.restrictions(m.userId).revision)) fail(409, 'RESTRICTION_CONFIRMATION_REQUIRED', '모든 참가자가 최신 식사 제한을 확인해야 해요.')
    this.put('party-restrictions', { id: p.id, items: p.members.flatMap(m => this.restrictions(m.userId).items.map(r => ({ ...r, ownerUserId: m.userId }))) })
  }
  const job = { id: id(), partyId: p.id, kind: `${kind.toUpperCase()}_GENERATION`, status: 'QUEUED', candidateSetId: null, error: null, createdAt: now(), completedAt: null }
  this.put('job', job); p.state = `${kind.toUpperCase()}_GENERATING`; p.generationJobId = job.id; this.partyChanged(p)
  // Scheduling happens after the request transaction commits. Jobs also resume
  // from QUEUED/PROCESSING on startup, so a restart cannot strand the party.
  req.afterCommit.push(() => scheduleJob(this, job.id))
  return job
}
export function scheduleJob(service, jobId) {
  const timer = setTimeout(() => {
    service.timers.delete(timer)
    try { service.store.transaction(() => runJob(service, jobId)) }
    catch (error) {
      console.error('Candidate job failed', jobId, error.name)
      service.store.transaction(() => {
        const j = service.get('job', jobId), p = service.get('party', j.partyId)
        if (j.status === 'CANCELED') return
        j.status = 'FAILED'; j.error = { code: 'GENERATION_FAILED', message: '후보 생성에 실패했어요. 다시 시도해 주세요.' }; j.completedAt = now(); service.put('job', j)
        if (p.state !== 'CANCELED') { p.state = j.kind === 'CATEGORY_GENERATION' ? 'WAITING' : 'CATEGORY_FINALIZED'; service.partyChanged(p, 'candidates.generation_failed', { jobId }) }
      })
    }
  }, service.options.jobDelay || 15)
  service.timers.add(timer)
}
function runJob(service, jobId) {
  const j = service.get('job', jobId), p = service.get('party', j.partyId), kind = j.kind === 'CATEGORY_GENERATION' ? 'CATEGORY' : 'RESTAURANT'
  if (!['QUEUED', 'PROCESSING'].includes(j.status)) return
  if (p.state === 'CANCELED' || p.generationJobId !== j.id) { service.put('job', { ...j, status: 'CANCELED', completedAt: now() }); return }
  const set = { id: id(), kind, revision: 1, finalized: false, items: [] }
  const { restaurants, menus } = nearbyMenus(service, p)
  const restrictions = service.partyRestrictions(p.id)
  if (kind === 'CATEGORY') {
    for (const category of service.store.all('category')) {
      const group = menus.filter(m => m.categoryId === category.id)
      // Conservative contract: one conflicting or incomplete menu excludes the
      // whole category inside the current radius/budget sales snapshot.
      if (!group.length || group.some(m => conflict(m, restrictions))) continue
      set.items.push({ id: id(), candidateSetId: set.id, category: { id: category.id, name: category.name, imageUrl: category.imageUrl || null }, nearbyRestaurantCount: new Set(group.map(m => m.restaurantId)).size, priceRange: { min: Math.min(...group.map(m => m.price)), max: Math.max(...group.map(m => m.price)) }, eliminators: [] })
    }
  } else {
    const categories = new Set(setFor(p, 'category').items.filter(c => !c.eliminators.length).map(c => c.category.id))
    for (const r of restaurants) {
      const group = menus.filter(m => m.restaurantId === r.id && categories.has(m.categoryId) && !conflict(m, restrictions))
      if (!group.length) continue
      set.items.push({ id: id(), candidateSetId: set.id, restaurant: { id: r.id, name: r.name, location: { ...r.location, address: r.address }, distanceMeters: Math.round(distance(p.location, r.location)), imageUrl: null }, representativeMenus: group.slice().sort((a, b) => Number(b.isRepresentative) - Number(a.isRepresentative)).slice(0, 3).map(m => ({ menuId: m.id, name: m.name, price: m.price, imageUrl: m.imageUrls[0] || null })), matchingCategoryIds: [...new Set(group.map(m => m.categoryId))], eliminators: [] })
    }
  }
  j.completedAt = now()
  if (!set.items.length) {
    j.status = 'FAILED'; j.error = { code: 'NO_ACTIVE_CANDIDATES', message: '거리·예산·식사 제한에 맞는 등록 메뉴가 없어요.' }
    p.state = kind === 'CATEGORY' ? 'WAITING' : 'CATEGORY_FINALIZED'
    service.put('job', j); service.partyChanged(p, 'candidates.generation_failed', { jobId }); return
  }
  j.status = 'SUCCEEDED'; j.candidateSetId = set.id; p.sets.push(set); p.state = `${kind}_REVIEW`
  service.put('job', j); service.partyChanged(p, 'candidates.generation_succeeded', { jobId, candidateSetId: set.id })
}
function list(req, kind) { const p = this.party(req.params.partyId, req.user), set = setFor(p, kind), me = member(p, req.user); return this.page(set.items.map(c => publicCandidate(c, me)), req, { candidateSet: publicSet(set) }) }
function detail(req, kind) { const p = this.party(req.params.partyId, req.user), { c, me } = candidate(p, req, kind); return publicCandidate(c, me) }
function view(req, kind) {
  const p = this.party(req.params.partyId, req.user); state(p, `${kind.toUpperCase()}_REVIEW`)
  const { c, me, set } = candidate(p, req, kind), views = me[`${kind}Views`]
  if (!views.includes(c.id)) { views.push(c.id); this.put('party', p); this.analysis('CANDIDATE_EXPOSED', c.id, req.user.id); this.event(`party:${p.id}`, `${kind}.viewed`, p, { candidateId: c.id }, req.user.id) }
  return { candidateId: c.id, candidateSetId: set.id, viewedByMe: true, viewedCount: views.length, totalCount: set.items.length }
}
function elimination(req, kind, restore = false) {
  const p = this.party(req.params.partyId, req.user); state(p, `${kind.toUpperCase()}_REVIEW`)
  const { set, c, me } = candidate(p, req, kind), own = c.eliminators.includes(me.id)
  // A repeated request is itself idempotent, even after marking review complete.
  if (restore ? own : !own) {
    if (me[`${kind}Complete`]) fail(409, 'REVIEW_LOCKED', '검토 완료를 먼저 취소해 주세요.')
    const wasActive = c.eliminators.length === 0
    c.eliminators = restore ? c.eliminators.filter(key => key !== me.id) : [...c.eliminators, me.id]
    const reviewReset = wasActive !== (c.eliminators.length === 0)
    if (reviewReset) { p.members.forEach(m => { m[`${kind}Complete`] = false }); set.revision++ }
    this.partyChanged(p, `${kind}.${restore ? 'restored' : 'eliminated'}`, { candidateId: c.id, status: c.eliminators.length ? 'ELIMINATED' : 'ACTIVE' })
    this.analysis(restore ? 'ELIMINATION_RESTORED' : 'CANDIDATE_ELIMINATED', c.id, req.user.id)
    if (reviewReset) this.event(`party:${p.id}`, 'review.reset', p, { kind: kind.toUpperCase() })
    return { candidateId: c.id, status: c.eliminators.length ? 'ELIMINATED' : 'ACTIVE', eliminatedByMe: c.eliminators.includes(me.id), partyVersion: p.version, reviewReset }
  }
  return { candidateId: c.id, status: c.eliminators.length ? 'ELIMINATED' : 'ACTIVE', eliminatedByMe: own, partyVersion: p.version, reviewReset: false }
}
function complete(req, kind, reopen = false) {
  const p = this.party(req.params.partyId, req.user); state(p, `${kind.toUpperCase()}_REVIEW`)
  const me = member(p, req.user), set = setFor(p, kind)
  if (!reopen && me[`${kind}Views`].length !== set.items.length) fail(409, 'REVIEW_NOT_COMPLETED', '모든 후보를 확인해 주세요.')
  if (me[`${kind}Complete`] === reopen) { me[`${kind}Complete`] = !reopen; this.partyChanged(p, `${kind}.review_${reopen ? 'reopened' : 'completed'}`, { memberId: me.id }) }
  return progress(p, me, kind)
}
function finalize(req, kind) {
  const p = this.party(req.params.partyId, req.user); host(p, req.user); match(req, p.version); state(p, `${kind.toUpperCase()}_REVIEW`)
  this.requireActiveGuests(p)
  if (p.members.some(m => !m[`${kind}Complete`])) fail(409, 'MEMBERS_REVIEW_INCOMPLETE', '모든 참가자의 검토 완료를 기다려 주세요.')
  const set = setFor(p, kind)
  if (!set.items.some(c => !c.eliminators.length)) fail(409, 'NO_ACTIVE_CANDIDATES', '남은 후보가 없어요. 본인이 소거한 후보를 복구해 주세요.')
  set.finalized = true; p.state = `${kind.toUpperCase()}_FINALIZED`; this.partyChanged(p)
  set.items.filter(c => !c.eliminators.length).forEach(c => this.analysis(`${kind.toUpperCase()}_SURVIVED`, c.id))
  return publicParty(p, req.user)
}
export const reviewHandlers = {
  generateCategoryCandidates(req) { return generate.call(this, req, 'category') },
  generateRestaurantCandidates(req) { return generate.call(this, req, 'restaurant') },
  selectRestaurant(req) {
    const p = this.party(req.params.partyId, req.user); host(p, req.user); match(req, p.version); state(p, 'RESTAURANT_FINALIZED')
    const c = setFor(p, 'restaurant').items.find(c => c.id === req.body.restaurantCandidateId)
    if (!c || c.eliminators.length) fail(409, 'NO_ACTIVE_CANDIDATES', '선택할 수 없는 식당이에요.')
    p.selectedRestaurantId = c.restaurant.id; p.state = 'RESTAURANT_SELECTED'; this.partyChanged(p, 'restaurant.selected', { restaurantId: c.restaurant.id }); this.analysis('RESTAURANT_SELECTED', c.restaurant.id)
    return publicParty(p, req.user)
  },
  listRestaurantCandidateMenus(req) {
    const p = this.party(req.params.partyId, req.user), { c } = candidate(p, req, 'restaurant')
    const menus = this.store.all('menu').filter(m => m.restaurantId === c.restaurant.id && !m.deleted && m.salesStatus === 'AVAILABLE' && !conflict(m, this.partyRestrictions(p.id)))
    const page = this.page(menus.map(publicMenu), req); page.items.forEach(m => this.analysis('MENU_VIEWED', m.id, req.user.id)); return page
  },
}
for (const kind of ['category', 'restaurant']) {
  const cap = kind[0].toUpperCase() + kind.slice(1)
  Object.assign(reviewHandlers, {
    [`list${cap}Candidates`](req) { return list.call(this, req, kind) },
    [`get${cap}Candidate`](req) { return detail.call(this, req, kind) },
    [`view${cap}Candidate`](req) { return view.call(this, req, kind) },
    [`eliminate${cap}Candidate`](req) { return elimination.call(this, req, kind) },
    [`restore${cap}Candidate`](req) { return elimination.call(this, req, kind, true) },
    [`get${cap}ReviewProgress`](req) { const p = this.party(req.params.partyId, req.user); return progress(p, member(p, req.user), kind) },
    [`complete${cap}Review`](req) { return complete.call(this, req, kind) },
    [`reopen${cap}Review`](req) { return complete.call(this, req, kind, true) },
    [`finalize${cap}Review`](req) { return finalize.call(this, req, kind) },
  })
}
