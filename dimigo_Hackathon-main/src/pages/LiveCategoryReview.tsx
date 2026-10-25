import { useRef, useState } from 'react'
import { api } from '../lib/api'
import { foods } from '../data/foods'
import { formatRadius } from '../lib/registeredCatalog'
import type { CategoryCandidate, Party, ReviewProgress } from '../types/api'

type Gesture = { id: string; pointerId: number; x: number; y: number; axis: 'pending' | 'horizontal' | 'vertical'; card: HTMLElement }
type HistoryItem = { id: string; method: 'PUT' | 'DELETE' }
const asset = (name: string) => `${import.meta.env.BASE_URL}images/${encodeURIComponent(name)}`

export default function LiveCategoryReview({ party, candidates, progress, busy, isHost, nickname, error, onHome, onCommand, onRefresh }: {
  party: Party; candidates: CategoryCandidate[]; progress: ReviewProgress; busy: boolean; isHost: boolean
  nickname: string; error: string; onHome: () => void
  onCommand: (path: string, body?: unknown, version?: number, method?: string) => Promise<boolean>
  onRefresh: () => Promise<void>
}) {
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [exiting, setExiting] = useState<string[]>([])
  const [pendingElimination, setPendingElimination] = useState<string[]>([])
  const [panel, setPanel] = useState<'profile' | 'party' | null>(null)
  const [notice, setNotice] = useState('')
  const pointer = useRef<Gesture | null>(null)
  const elements = useRef(new Map<string, HTMLElement>())
  const changeElimination = async (id: string, method: 'PUT' | 'DELETE') => {
    if (method === 'PUT' && !candidates.find(candidate => candidate.id === id)?.viewedByMe) {
      try { await api(`/parties/${party.id}/category-candidates/${id}/view`, { method: 'POST' }) }
      catch { setNotice('메뉴 확인을 저장하지 못했어요. 다시 시도해 주세요.'); return false }
    }
    const changed = await onCommand(`/category-candidates/${id}/elimination`, undefined, undefined, method)
    if (changed) { setHistory(items => [...items, { id, method }]); setNotice('') }
    return changed
  }
  const confirmView = (id: string) => {
    void api(`/parties/${party.id}/category-candidates/${id}/view`, { method: 'POST' })
      .then(() => onRefresh())
      .catch(() => setNotice('메뉴 확인을 저장하지 못했어요.'))
  }
  const resetDrag = (card: HTMLElement) => {
    card.style.transition = 'transform 160ms cubic-bezier(.2,.8,.2,1)'
    card.style.transform = ''
  }
  const eliminate = (id: string, card?: HTMLElement) => {
    if (busy || progress.reviewCompleted || exiting.includes(id) || candidates.find(c => c.id === id)?.status !== 'ACTIVE') return
    const target = card || elements.current.get(id)?.querySelector<HTMLElement>('.food-card')
    if (target) {
      target.style.transition = 'transform 200ms cubic-bezier(.2,.8,.2,1)'
      target.style.transform = 'translate3d(-110%, 0, 0)'
    }
    setExiting(items => [...items, id])
    setPendingElimination(items => [...items, id])
    const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 200
    window.setTimeout(() => {
      setExiting(items => items.filter(item => item !== id))
      window.requestAnimationFrame(() => {
        target?.style.removeProperty('transition')
        target?.style.removeProperty('transform')
      })
    }, delay)
    void changeElimination(id, 'PUT').then(() => setPendingElimination(items => items.filter(item => item !== id)))
  }
  const restore = (id: string) => {
    if (busy || progress.reviewCompleted || !candidates.find(c => c.id === id)?.eliminatedByMe) return
    void changeElimination(id, 'DELETE')
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
    <header className="preferences-header">
      <button onClick={onHome} aria-label="홈으로 돌아가기">〈 <span>홈</span></button>
      <span className="preferences-logo"><img src={asset('logo.png')} alt="시로 XIRO" /></span>
      <button className="undo-button" disabled={!history.length || busy || progress.reviewCompleted} onClick={undo}><img src={asset('return.png')} alt="" /> 되돌리기</button>
    </header>
    <section className="review-banner">
      <small>{party.location.address || party.title} 반경 {formatRadius(party.searchRadiusMeters)}</small>
      <h1>메뉴 확인 <b>{progress.viewedCount}<span>/{progress.totalCount}</span></b></h1>
      <progress value={progress.viewedCount} max={progress.totalCount || 1} aria-label="메뉴 확인 진행률" />
      <img src={asset('mascot.png')} alt="주먹밥 캐릭터" />
    </section>
    <div className="swipe-guide"><span>≪</span><p><small>이번 모임에서 먹고 싶지 않은 메뉴가 있나요? · 소거 {ownEliminated.length}개</small><strong>왼쪽으로 밀어 소거해 주세요!</strong></p></div>
    {error && <p className="error-box" role="alert">{error}</p>}
    <ul className="food-list">{candidates.map(candidate => {
      const food = foods.find(item => item.id === candidate.category.id)
      const isExiting = exiting.includes(candidate.id)
      const collapsed = (candidate.status === 'ELIMINATED' || pendingElimination.includes(candidate.id)) && !isExiting
      const price = candidate.priceRange.min === candidate.priceRange.max
        ? `${candidate.priceRange.min.toLocaleString()}원`
        : `${candidate.priceRange.min.toLocaleString()}원~${candidate.priceRange.max.toLocaleString()}원`
      return <li key={candidate.id} data-candidate-id={candidate.id} ref={element => { if (element) elements.current.set(candidate.id, element); else elements.current.delete(candidate.id) }} className={`food-row ${collapsed ? 'is-collapsed' : ''} ${isExiting ? 'is-exiting' : ''}`}>
        <div className="swipe-reveal" aria-hidden="true">제외</div>
        <article className="food-card"
          onPointerDown={event => {
            if ((event.target as HTMLElement).closest('button') || busy || progress.reviewCompleted) return
            pointer.current = { id: candidate.id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, axis: 'pending', card: event.currentTarget }
          }}
          onPointerMove={event => {
            const gesture = pointer.current
            if (!gesture || gesture.id !== candidate.id || gesture.pointerId !== event.pointerId) return
            const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y
            if (gesture.axis === 'pending') {
              if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) gesture.axis = 'vertical'
              else if (dx < -8 && Math.abs(dx) > Math.abs(dy) * 1.2) { gesture.axis = 'horizontal'; event.currentTarget.setPointerCapture(event.pointerId) }
            }
            if (gesture.axis === 'horizontal') {
              event.preventDefault()
              event.currentTarget.style.transition = 'none'
              event.currentTarget.style.transform = `translate3d(${Math.max(-event.currentTarget.clientWidth, Math.min(0, dx))}px, 0, 0)`
            }
          }}
          onPointerUp={event => {
            const gesture = pointer.current
            if (!gesture || gesture.id !== candidate.id || gesture.pointerId !== event.pointerId) return
            if (gesture.axis === 'horizontal') {
              const threshold = Math.min(96, event.currentTarget.clientWidth * .28)
              if (event.clientX - gesture.x <= -threshold) eliminate(candidate.id, event.currentTarget)
              else resetDrag(event.currentTarget)
              if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
            }
            pointer.current = null
          }}
          onPointerCancel={() => { if (pointer.current?.axis === 'horizontal') resetDrag(pointer.current.card); pointer.current = null }}
        >
          {(candidate.category.imageUrl || food?.image) && <img className="food-photo" src={candidate.category.imageUrl || asset(food!.image)} alt={candidate.category.name} draggable={false} />}
          <div className="food-info"><h2>{candidate.category.name}</h2><p>{food?.description || `주변 등록 식당 ${candidate.nearbyRestaurantCount}곳`}</p><strong>{price}</strong><small>{food?.detail || `주변 등록 식당 ${candidate.nearbyRestaurantCount}곳`}</small><div className="food-controls"><span>{candidate.viewedByMe ? '확인 · 후보' : '미확인'}</span>{!candidate.viewedByMe && <button disabled={busy} onClick={() => confirmView(candidate.id)}>확인</button>}<button disabled={busy || progress.reviewCompleted} onClick={() => eliminate(candidate.id)}>소거</button></div></div>
          <span className="swipe-handle" aria-hidden="true">❮❮</span>
        </article>
      </li>
    })}</ul>
    {ownEliminated.length > 0 && <section className="excluded-tray"><h2>소거한 메뉴</h2><div>{ownEliminated.map(c => <div className="excluded-row" key={c.id}><span className="excluded-name">{c.category.name}</span>{!c.viewedByMe && <button onClick={() => confirmView(c.id)}>확인</button>}<button disabled={busy || progress.reviewCompleted} onClick={() => restore(c.id)}>다시 포함</button></div>)}</div></section>}
    {sharedEliminated.length > 0 && <section className="excluded-tray"><h2>함께 소거한 메뉴</h2><div>{sharedEliminated.map(c => <div className="excluded-row" key={c.id}><span className="excluded-name">{c.category.name}</span>{!c.viewedByMe && <button onClick={() => confirmView(c.id)}>확인</button>}<button disabled={busy || progress.reviewCompleted} onClick={() => void changeElimination(c.id, 'PUT')}>나도 소거</button></div>)}</div></section>}
    {candidates.length === 0 && <p className="empty-candidates">이 파티 조건에 맞는 메뉴가 없어요.</p>}
    <p role="status" className="vote-notice">{notice}</p>
    <section className="live-vote-actions"><p>검토 완료 {progress.partyCompletedMemberCount}/{progress.partyMemberCount}명</p><button className="primary" disabled={busy || !progress.reviewCompleted && progress.viewedCount !== progress.totalCount} onClick={() => void onCommand('/category-review/complete', undefined, undefined, progress.reviewCompleted ? 'DELETE' : 'POST')}>{progress.reviewCompleted ? '검토 완료 취소' : '메뉴 검토 완료'}</button>{isHost && <button className="primary" disabled={busy || !progress.allMembersCompleted || !candidates.some(c => c.status === 'ACTIVE')} onClick={() => void onCommand('/category-review/finalize', undefined, party.version)}>메뉴 후보 확정</button>}</section>
    <nav className="bottom-nav" aria-label="하단 내비게이션"><button aria-label="프로필" onClick={() => setPanel('profile')}><svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="currentColor"/><circle cx="16" cy="11" r="5" fill="#ff9598"/><path d="M7 25c0-10 18-10 18 0" fill="#ff9598"/></svg></button><button className="party-plus" aria-label="현재 파티 정보" onClick={() => setPanel('party')}>＋</button><button aria-label="홈" onClick={onHome}><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M2 14 16 2l14 12v16H20V19h-8v11H2Z" fill="currentColor"/></svg></button></nav>
    {panel && <div className="panel-backdrop"><section className="demo-panel" role="dialog" aria-modal="true" aria-labelledby="vote-panel-title"><h2 id="vote-panel-title">{panel === 'profile' ? '내 프로필' : party.title}</h2>{panel === 'profile' ? <p>닉네임: <strong>{nickname}</strong></p> : <p>{party.location.address} · 반경 {formatRadius(party.searchRadiusMeters)} · {party.budgetPerPerson?.toLocaleString() || '예산 제한 없음'}{party.budgetPerPerson !== null && '원 이하'}</p>}<button className="primary" autoFocus onClick={() => setPanel(null)}>닫기</button></section></div>}
  </main>
}
