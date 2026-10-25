import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import type { CategoryCandidate, Party, RestaurantCandidate, ReviewProgress } from '../types/api'
import { foods } from '../data/foods'

type Candidate = CategoryCandidate | RestaurantCandidate
export default function LiveReview({ party, candidates, progress, busy, isHost, onCommand, onRefresh }: {
  party: Party; candidates: Candidate[]; progress: ReviewProgress; busy: boolean; isHost: boolean
  onCommand: (path: string, body?: unknown, version?: number, method?: string) => Promise<void>; onRefresh: () => Promise<void>
}) {
  const kind = party.state === 'CATEGORY_REVIEW' ? 'category' : 'restaurant', label = kind === 'category' ? '음식' : '식당'
  const [expanded, setExpanded] = useState<Record<string, string>>({}), [notice, setNotice] = useState('')
  const elements = useRef(new Map<string, HTMLElement>()), views = useRef<string[]>([]), processing = useRef(false), active = useRef(true)
  const already = useRef(new Set<string>()), gesture = useRef<{ id: string; x: number; y: number } | null>(null)
  const base = `/parties/${party.id}/${kind}-candidates`
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  useEffect(() => {
    const pump = async () => {
      if (processing.current) return
      processing.current = true
      try {
        while (views.current.length && active.current) {
          const candidateId = views.current.shift()!
          try { await api(`${base}/${candidateId}/view`, { method: 'POST' }) }
          catch { already.current.delete(candidateId) }
        }
        if (active.current) await onRefresh()
      } finally { processing.current = false }
    }
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const candidateId = (entry.target as HTMLElement).dataset.candidateId!
        if (entry.isIntersecting && !already.current.has(candidateId)) { already.current.add(candidateId); views.current.push(candidateId) }
      }
      if (views.current.length) void pump()
    }, { threshold: 0.55 })
    for (const c of candidates) { if (c.viewedByMe) already.current.add(c.id); const element = elements.current.get(c.id); if (element) observer.observe(element) }
    return () => observer.disconnect()
  }, [base, candidates, onRefresh])
  const eliminate = (c: Candidate) => void onCommand(`/${kind}-candidates/${c.id}/elimination`, undefined, undefined, c.eliminatedByMe ? 'DELETE' : 'PUT')
  const detail = async (c: RestaurantCandidate) => {
    if (expanded[c.id]) { setExpanded(p => ({ ...p, [c.id]: '' })); return }
    try { const page = await api<{ items: { name: string; price: number }[] }>(`${base}/${c.id}/menus?limit=100`); setExpanded(p => ({ ...p, [c.id]: page.items.map(m => `${m.name} ${m.price.toLocaleString()}원`).join(' · ') })) }
    catch (e) { setNotice((e as Error).message) }
  }
  return <>
    <section className="review-banner"><small>반경 {party.searchRadiusMeters}m · {label} 함께 소거하기</small><h1>{label} 확인 <b>{progress.viewedCount}<span>/{progress.totalCount}</span></b></h1><progress value={progress.viewedCount} max={progress.totalCount || 1} aria-label={`${label} 확인 진행률`} /><img src="/images/mascot.png" alt="시로 캐릭터" /></section>
    <div className="swipe-guide"><span>≪</span><p><small>소거한 사람은 공개되지 않아요.</small><strong>왼쪽으로 밀어 먹고 싶지 않은 후보를 빼요</strong></p></div>
    {notice && <p role="alert">{notice}</p>}
    <div className="live-candidates">{candidates.map(c => {
      const category = 'category' in c ? c.category : null, restaurant = 'restaurant' in c ? c.restaurant : null
      const name = category?.name || restaurant?.name || '', image = category ? foods.find(f => f.id === category.id)?.image : null
      return <article key={c.id} data-candidate-id={c.id} ref={el => { if (el) elements.current.set(c.id, el); else elements.current.delete(c.id) }} className={`candidate-card ${c.status === 'ELIMINATED' ? 'eliminated' : ''}`} onPointerDown={e => { if (!(e.target as HTMLElement).closest('button')) gesture.current = { id: c.id, x: e.clientX, y: e.clientY } }} onPointerUp={e => { const g = gesture.current; if (g?.id === c.id && e.clientX - g.x < -65 && Math.abs(e.clientY - g.y) < 35 && !busy && !progress.reviewCompleted && !c.eliminatedByMe) eliminate(c); gesture.current = null }} onPointerCancel={() => { gesture.current = null }}>
        <div className="candidate-top">{image && <img src={`/images/${encodeURIComponent(image)}`} alt={name} draggable={false} />}<div><h2>{name}</h2>{'priceRange' in c && <><p>{c.priceRange.min.toLocaleString()}원{c.priceRange.min !== c.priceRange.max && `~${c.priceRange.max.toLocaleString()}원`}</p><small>주변 등록 식당 {c.nearbyRestaurantCount}곳</small></>}{'representativeMenus' in c && <><p>{c.restaurant.distanceMeters}m · {c.representativeMenus.map(m => m.name).join(', ')}</p><small>{c.restaurant.location.address}</small></>}</div></div>
        <div className="candidate-actions"><span className="candidate-status">{c.status === 'ACTIVE' ? '남은 후보' : c.eliminatedByMe ? '내가 소거한 후보' : '공동 소거된 후보'}</span><button className="secondary" disabled={busy || progress.reviewCompleted} onClick={() => eliminate(c)}>{c.eliminatedByMe ? '내 소거 취소' : '소거'}</button>{!c.viewedByMe && <button className="text-button" disabled={busy} onClick={() => void onCommand(`/${kind}-candidates/${c.id}/view`)}>확인</button>}</div>
        {'restaurant' in c && <><button className="text-button" onClick={() => void detail(c)}>{expanded[c.id] ? '메뉴 접기' : '판매 메뉴 더 보기'}</button>{expanded[c.id] && <p className="menu-detail">{expanded[c.id]}</p>}</>}
      </article>
    })}</div>
    {!candidates.some(c => c.status === 'ACTIVE') && <p className="error-box" role="status">남은 후보가 없어요. 본인이 소거한 후보를 복구해 주세요.</p>}
    <section className="review-footer"><p>검토 완료 {progress.partyCompletedMemberCount}/{progress.partyMemberCount}명</p><ul className="member-chips">{party.members.map(m => <li key={m.id}>{m.displayName} · {(kind === 'category' ? m.categoryReviewStatus : m.restaurantReviewStatus) === 'COMPLETED' ? '완료' : '검토 중'}</li>)}</ul>
      <button className="primary" disabled={busy || !progress.reviewCompleted && progress.viewedCount !== progress.totalCount} onClick={() => void onCommand(`/${kind}-review/complete`, undefined, undefined, progress.reviewCompleted ? 'DELETE' : 'POST')}>{progress.reviewCompleted ? '검토 완료 취소' : `${label} 검토 완료`}</button>
      {isHost && <button className="secondary" disabled={busy || !progress.allMembersCompleted || !candidates.some(c => c.status === 'ACTIVE')} onClick={() => void onCommand(`/${kind}-review/finalize`, undefined, party.version)}>{label} 후보 확정</button>}
    </section>
  </>
}
