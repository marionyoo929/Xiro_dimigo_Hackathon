import { useState } from 'react'
import { allPages } from '../lib/api'
import { useCandidateViews } from '../hooks/useCandidateViews'
import { useSwipeElimination } from '../hooks/useSwipeElimination'
import type { CategoryCandidate, Menu, Party, RestaurantCandidate, ReviewProgress } from '../types/api'
import CatalogPhoto from '../components/CatalogPhoto'

type Candidate = CategoryCandidate | RestaurantCandidate
export default function LiveReview({ party, candidates, progress, busy, isHost, onCommand, onRefresh }: {
  party: Party; candidates: Candidate[]; progress: ReviewProgress; busy: boolean; isHost: boolean
  onCommand: (path: string, body?: unknown, version?: number, method?: string) => Promise<boolean>; onRefresh: () => Promise<void>
}) {
  const kind = party.state === 'CATEGORY_REVIEW' ? 'category' : 'restaurant', label = kind === 'category' ? '음식' : '식당'
  const base = `/parties/${party.id}/${kind}-candidates`
  const views = useCandidateViews(base, candidates, onRefresh)
  const viewedCount = Math.min(progress.totalCount, Math.max(progress.viewedCount, views.viewedCount))
  const canComplete = !views.syncing && !views.error && viewedCount === progress.totalCount && progress.viewedCount === progress.totalCount
  const eliminate = async (c: Candidate) => {
    if (!c.eliminatedByMe && !await views.markViewed(c.id)) return false
    return onCommand(`/${kind}-candidates/${c.id}/elimination`, undefined, undefined, c.eliminatedByMe ? 'DELETE' : 'PUT')
  }
  return <>
    <section className="review-banner"><small>반경 {party.searchRadiusMeters}m · {label} 함께 소거하기</small><h1>{label} 확인 <b>{viewedCount}<span>/{progress.totalCount}</span></b></h1><progress value={viewedCount} max={progress.totalCount || 1} aria-label={`${label} 확인 진행률`} /><img src="/images/mascot.png" alt="시로 캐릭터" /></section>
    <div className="swipe-guide"><span>≪</span><p><small>소거한 사람은 공개되지 않아요.</small><strong>왼쪽으로 밀어 먹고 싶지 않은 후보를 빼요</strong></p></div>
    <p className="review-read-guide">화면에서 본 {label}은 자동으로 확인돼요. 모든 후보를 확인한 뒤 검토를 완료해 주세요.</p>
    {views.error && <p className="error-box" role="alert">{views.error}<button type="button" onClick={views.retry}>확인 기록 다시 저장</button></p>}
    <div className="live-candidates">{candidates.map(c => <CandidateCard key={c.id} candidate={c} base={base} viewed={views.viewed(c.id)} disabled={busy || progress.reviewCompleted} register={views.register} onConfirm={() => views.markViewed(c.id)} onEliminate={() => eliminate(c)} />)}</div>
    {!candidates.some(c => c.status === 'ACTIVE') && <p className="error-box" role="status">남은 후보가 없어요. 본인이 소거한 후보를 복구해 주세요.</p>}
    <p className="review-save-status" role="status">{views.syncing ? '확인 기록을 저장하고 있어요…' : ''}</p>
    <section className="review-footer"><p>검토 완료 {progress.partyCompletedMemberCount}/{progress.partyMemberCount}명</p><ul className="member-chips">{party.members.map(m => <li key={m.id}>{m.displayName} · {(kind === 'category' ? m.categoryReviewStatus : m.restaurantReviewStatus) === 'COMPLETED' ? '완료' : '검토 중'}</li>)}</ul>
      <button className="primary" disabled={busy || !progress.reviewCompleted && !canComplete} onClick={() => void onCommand(`/${kind}-review/complete`, undefined, undefined, progress.reviewCompleted ? 'DELETE' : 'POST')}>{progress.reviewCompleted ? '검토 완료 취소' : `${label} 검토 완료`}</button>
      {isHost && <button className="secondary" disabled={busy || views.syncing || !progress.allMembersCompleted || !candidates.some(c => c.status === 'ACTIVE')} onClick={() => void onCommand(`/${kind}-review/finalize`, undefined, party.version)}>{label} 후보 확정</button>}
    </section>
  </>
}

function CandidateCard({ candidate: c, base, viewed, disabled, register, onConfirm, onEliminate }: {
  candidate: Candidate; base: string; viewed: boolean; disabled: boolean
  register: (id: string, element: HTMLElement | null) => void; onConfirm: () => Promise<boolean>; onEliminate: () => Promise<boolean>
}) {
  const swipe = useSwipeElimination(disabled || c.status !== 'ACTIVE', onEliminate)
  const [expanded, setExpanded] = useState(false), [menus, setMenus] = useState<Pick<Menu, 'id' | 'name' | 'price' | 'imageUrls'>[] | null>(null)
  const [loading, setLoading] = useState(false), [error, setError] = useState('')
  const category = 'category' in c ? c.category : null
  const name = category?.name || ('restaurant' in c ? c.restaurant.name : '')
  const image = category?.imageUrl || ('restaurant' in c ? c.restaurant.imageUrl || c.representativeMenus.find(m => m.imageUrl)?.imageUrl : null)
  const detail = async (retry = false) => {
    if (expanded && !retry) { setExpanded(false); return }
    setExpanded(true)
    if (!retry && menus || loading) return
    setLoading(true); setError('')
    try { setMenus(await allPages<Pick<Menu, 'id' | 'name' | 'price' | 'imageUrls'>>(`${base}/${c.id}/menus`)) }
    catch (reason) { setError((reason as Error).message) }
    finally { setLoading(false) }
  }
  return <div className={`candidate-swipe-row ${swipe.exiting ? 'is-exiting' : ''}`}>
    <div className="swipe-reveal" aria-hidden="true">제외</div>
    <article data-candidate-id={c.id} ref={el => register(c.id, el)} className={`candidate-card ${c.status === 'ELIMINATED' ? 'eliminated' : ''}`} {...swipe.handlers} style={swipe.style}>
      <div className="candidate-top"><CatalogPhoto className="candidate-photo" src={image} alt={name} /><div><h2>{name}</h2>{'priceRange' in c && <><p>{c.priceRange.min.toLocaleString()}원{c.priceRange.min !== c.priceRange.max && `~${c.priceRange.max.toLocaleString()}원`}</p><small>주변 등록 식당 {c.nearbyRestaurantCount}곳</small></>}{'representativeMenus' in c && <><p>{c.restaurant.distanceMeters}m · {c.representativeMenus.map(m => m.name).join(', ')}</p><small>{c.restaurant.location.address}</small></>}</div></div>
      <div className="candidate-actions"><span className="candidate-status">{c.status === 'ACTIVE' ? viewed ? '확인 · 남은 후보' : '미확인 · 남은 후보' : c.eliminatedByMe ? '내가 소거한 후보' : '공동 소거된 후보'}</span><button className="secondary" disabled={disabled || swipe.exiting} onClick={() => { if (c.status === 'ACTIVE') void swipe.eliminate(); else void onEliminate() }}>{c.eliminatedByMe ? '내 소거 취소' : c.status === 'ELIMINATED' ? '나도 소거' : '소거'}</button>{!viewed && <button className="text-button" disabled={disabled} onClick={() => void onConfirm()}>확인</button>}</div>
      {'restaurant' in c && <><button className="text-button" disabled={loading} onClick={() => void detail()}>{loading ? '메뉴 불러오는 중…' : expanded ? '메뉴 접기' : '판매 메뉴 더 보기'}</button>{expanded && <div className="menu-detail">{error ? <p role="alert">{error}<button className="text-button" onClick={() => void detail(true)}>다시 불러오기</button></p> : menus?.length === 0 ? <p>판매 가능한 추가 메뉴가 없어요.</p> : menus?.map(menu => <div className="menu-detail-row" key={menu.id}>{menu.imageUrls[0] && <CatalogPhoto src={menu.imageUrls[0]} alt={menu.name} />}<p>{menu.name} · {menu.price.toLocaleString()}원</p></div>)}</div>}</>}
    </article>
  </div>
}
