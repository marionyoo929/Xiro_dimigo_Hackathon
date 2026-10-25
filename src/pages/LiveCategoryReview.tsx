import { useState } from 'react'
import CatalogPhoto from '../components/CatalogPhoto'
import { formatRadius } from '../lib/registeredCatalog'
import { useCandidateViews } from '../hooks/useCandidateViews'
import { useSwipeElimination } from '../hooks/useSwipeElimination'
import type { CategoryCandidate, Party, ReviewProgress } from '../types/api'

type HistoryItem = { id: string; method: 'PUT' | 'DELETE' }
const asset = (name: string) => `${import.meta.env.BASE_URL}images/${encodeURIComponent(name)}`
export default function LiveCategoryReview({ party, candidates, progress, busy, isHost, nickname, error, resetNotice, onHome, onCommand, onRefresh }: {
  party: Party; candidates: CategoryCandidate[]; progress: ReviewProgress; busy: boolean; isHost: boolean
  nickname: string; error: string; resetNotice: string; onHome: () => void
  onCommand: (path: string, body?: unknown, version?: number, method?: string) => Promise<boolean>
  onRefresh: () => Promise<void>
}) {
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [panel, setPanel] = useState<'profile' | 'party' | null>(null), [notice, setNotice] = useState('')
  const views = useCandidateViews(`/parties/${party.id}/category-candidates`, candidates, onRefresh)
  const viewedCount = Math.min(progress.totalCount, Math.max(progress.viewedCount, views.viewedCount))
  const canComplete = !views.syncing && !views.error && viewedCount === progress.totalCount && progress.viewedCount === progress.totalCount
  const changeElimination = async (id: string, method: 'PUT' | 'DELETE') => {
    if (method === 'PUT' && !await views.markViewed(id)) return false
    const changed = await onCommand(`/category-candidates/${id}/elimination`, undefined, undefined, method)
    if (changed) { setHistory(items => [...items, { id, method }]); setNotice('') }
    return changed
  }
  const undo = () => {
    const last = history.at(-1)
    if (!last || busy || progress.reviewCompleted) return
    void onCommand(`/category-candidates/${last.id}/elimination`, undefined, undefined, last.method === 'PUT' ? 'DELETE' : 'PUT').then(changed => {
      if (changed) { setHistory(items => items.slice(0, -1)); setNotice('최근 소거·복구 동작을 취소했어요.') }
    })
  }
  const ownEliminated = candidates.filter(c => c.eliminatedByMe)
  const sharedEliminated = candidates.filter(c => c.status === 'ELIMINATED' && !c.eliminatedByMe)
  return <main className="onboarding vote-screen live-vote-screen">
    <header className="preferences-header"><button onClick={onHome} aria-label="홈으로 돌아가기">〈 <span>홈</span></button><span className="preferences-logo"><img src={asset('logo.png')} alt="시로 XIRO" /></span><button className="undo-button" disabled={!history.length || busy || progress.reviewCompleted} onClick={undo}><img src={asset('return.png')} alt="" /> 되돌리기</button></header>
    <section className="review-banner"><small>{party.location.address?.split('\n')[0] || party.title} 반경 {formatRadius(party.searchRadiusMeters)}</small><h1>메뉴 확인 <b>{viewedCount}<span>/{progress.totalCount}</span></b></h1><progress value={viewedCount} max={progress.totalCount || 1} aria-label="메뉴 확인 진행률" /><img src={asset('mascot.png')} alt="주먹밥 캐릭터" /></section>
    <div className="swipe-guide"><span>≪</span><p><small>먹고 싶지 않은 메뉴를 빼요 · 소거 {candidates.filter(c => c.status === 'ELIMINATED').length}개</small><strong>왼쪽으로 밀어 소거해 주세요!</strong></p></div>
    <p className="review-read-guide">화면에서 본 메뉴는 자동으로 확인돼요. 소거한 메뉴도 확인한 뒤 검토를 완료해 주세요.</p>
    {error && <p className="error-box" role="alert">{error}</p>}
    {resetNotice && <p className="notice-box" role="status">{resetNotice}</p>}
    {views.error && <p className="error-box" role="alert">{views.error}<button type="button" onClick={views.retry}>확인 기록 다시 저장</button></p>}
    <ul className="food-list">{candidates.map(candidate => <CategoryCard key={candidate.id} candidate={candidate} viewed={views.viewed(candidate.id)} disabled={busy || progress.reviewCompleted} register={views.register} onConfirm={() => views.markViewed(candidate.id)} onEliminate={() => changeElimination(candidate.id, 'PUT')} />)}</ul>
    {([{ title: '소거한 메뉴', items: ownEliminated }, { title: '함께 소거한 메뉴', items: sharedEliminated }]).map(group => group.items.length > 0 && <section className="excluded-tray" key={group.title}><h2>{group.title}</h2><div>{group.items.map(c => <div className="excluded-row" key={c.id} data-candidate-id={c.id} ref={element => views.register(c.id, element)}><span className="excluded-name">{c.category.name}</span>{!views.viewed(c.id) && <button disabled={busy} onClick={() => void views.markViewed(c.id)}>확인</button>}<button disabled={busy || progress.reviewCompleted} onClick={() => void changeElimination(c.id, c.eliminatedByMe ? 'DELETE' : 'PUT')}>{c.eliminatedByMe ? '다시 포함' : '나도 소거'}</button></div>)}</div></section>)}
    {candidates.length === 0 && <p className="empty-candidates">이 파티 조건에 맞는 메뉴가 없어요.</p>}
    <p role="status" className="vote-notice">{views.syncing ? '확인 기록을 저장하고 있어요…' : notice}</p>
    <section className="live-vote-actions"><p>검토 완료 {progress.partyCompletedMemberCount}/{progress.partyMemberCount}명</p><ul className="member-chips">{party.members.map(m => <li key={m.id}>{m.displayName} · {m.categoryReviewStatus === 'COMPLETED' ? '완료' : '검토 중'}</li>)}</ul><button className="primary" disabled={busy || !progress.reviewCompleted && !canComplete} onClick={() => void onCommand('/category-review/complete', undefined, undefined, progress.reviewCompleted ? 'DELETE' : 'POST')}>{progress.reviewCompleted ? '검토 완료 취소' : '메뉴 검토 완료'}</button>{isHost && <button className="primary" disabled={busy || views.syncing || !progress.allMembersCompleted || !candidates.some(c => c.status === 'ACTIVE')} onClick={() => void onCommand('/category-review/finalize', undefined, party.version)}>메뉴 후보 확정</button>}</section>
    {isHost && <details className="danger-zone"><summary>파티 관리</summary><button className="danger secondary" disabled={busy} onClick={() => void onCommand('', undefined, party.version, 'DELETE')}>파티 취소</button></details>}
    <nav className="bottom-nav" aria-label="하단 내비게이션"><button aria-label="프로필" onClick={() => setPanel('profile')}><svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="currentColor"/><circle cx="16" cy="11" r="5" fill="#ff9598"/><path d="M7 25c0-10 18-10 18 0" fill="#ff9598"/></svg></button><button className="party-plus" aria-label="현재 파티 정보" onClick={() => setPanel('party')}>＋</button><button aria-label="홈" onClick={onHome}><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M2 14 16 2l14 12v16H20V19h-8v11H2Z" fill="currentColor"/></svg></button></nav>
    {panel && <div className="panel-backdrop"><section className="demo-panel" role="dialog" aria-modal="true" aria-labelledby="vote-panel-title"><h2 id="vote-panel-title">{panel === 'profile' ? '내 프로필' : party.title}</h2>{panel === 'profile' ? <p>닉네임: <strong>{nickname}</strong></p> : <p>{party.location.address} · 반경 {formatRadius(party.searchRadiusMeters)} · {party.budgetPerPerson === null ? '예산 제한 없음' : `${party.budgetPerPerson.toLocaleString()}원 이하`}</p>}<button className="primary" autoFocus onClick={() => setPanel(null)}>닫기</button></section></div>}
  </main>
}

function CategoryCard({ candidate, viewed, disabled, register, onConfirm, onEliminate }: {
  candidate: CategoryCandidate; viewed: boolean; disabled: boolean
  register: (id: string, element: HTMLElement | null) => void; onConfirm: () => Promise<boolean>; onEliminate: () => Promise<boolean>
}) {
  const swipe = useSwipeElimination(disabled || candidate.status !== 'ACTIVE', onEliminate)
  const collapsed = candidate.status === 'ELIMINATED' && !swipe.exiting
  const price = candidate.priceRange.min === candidate.priceRange.max ? `${candidate.priceRange.min.toLocaleString()}원` : `${candidate.priceRange.min.toLocaleString()}원~${candidate.priceRange.max.toLocaleString()}원`
  return <li data-candidate-id={candidate.id} ref={element => { if (candidate.status === 'ACTIVE') register(candidate.id, element) }} className={`food-row ${collapsed ? 'is-collapsed' : ''} ${swipe.exiting ? 'is-exiting' : ''}`} inert={collapsed}>
    <div className="swipe-reveal" aria-hidden="true">제외</div>
    <article className="food-card" {...swipe.handlers} style={swipe.style}>
      <CatalogPhoto className="food-photo" src={candidate.category.imageUrl} alt={candidate.category.name} />
      <div className="food-info"><h2>{candidate.category.name}</h2><p>주변 등록 식당 {candidate.nearbyRestaurantCount}곳</p><strong>{price}</strong><small>같은 종류의 메뉴를 함께 확인해요</small><div className="food-controls"><span>{viewed ? '확인 · 후보' : '미확인'}</span>{!viewed && <button disabled={disabled} onClick={() => void onConfirm()}>확인</button>}<button disabled={disabled || swipe.exiting} onClick={() => void swipe.eliminate()}>소거</button></div></div><span className="swipe-handle" aria-hidden="true">❮❮</span>
    </article>
  </li>
}
