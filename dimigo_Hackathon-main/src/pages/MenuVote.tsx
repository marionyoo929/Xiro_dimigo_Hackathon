import { useEffect, useRef, useState } from 'react'
import { partyFoods, type Party } from '../data/sampleParty'
import { formatRadius } from '../lib/registeredCatalog'

type Vote = { reviewed: string[]; excluded: string[] }
type Gesture = { id: string; pointerId: number; x: number; y: number; axis: 'pending' | 'horizontal' | 'vertical'; card: HTMLElement }
const asset = (name: string) => `${import.meta.env.BASE_URL}images/${encodeURIComponent(name)}`
const voteKey = (partyId: string, participantId: string) => `xiro.party-vote.v1:${encodeURIComponent(partyId)}:${encodeURIComponent(participantId)}`
function readVote(key: string, ids: string[]): Vote {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}')
    const valid = (items: unknown): string[] => Array.isArray(items)
      ? [...new Set(items.filter((id): id is string => typeof id === 'string' && ids.includes(id)))]
      : []
    return { reviewed: valid(value.reviewed), excluded: valid(value.excluded) }
  } catch { return { reviewed: [], excluded: [] } }
}

export default function MenuVote({ party, participantId, nickname, onBack, onHome }: {
  party: Party; participantId: string; nickname: string; onBack: () => void; onHome: () => void
}) {
  const candidates = partyFoods(party)
  const key = voteKey(party.id, participantId)
  const candidateIds = new Set(candidates.map(food => food.id))
  const [storedVote, setVote] = useState<Vote>(() => readVote(key, candidates.map(food => food.id)))
  const vote = { reviewed: storedVote.reviewed.filter(id => candidateIds.has(id)), excluded: storedVote.excluded.filter(id => candidateIds.has(id)) }
  const [history, setHistory] = useState<Vote[]>([])
  const [notice, setNotice] = useState('')
  const [panel, setPanel] = useState<'profile' | 'party' | null>(null)
  const [exiting, setExiting] = useState<string[]>([])
  const pointer = useRef<Gesture | null>(null)
  const exitTimers = useRef(new Map<string, number>())
  const rows = useRef(new Map<string, HTMLElement>())
  useEffect(() => () => { exitTimers.current.forEach(timer => window.clearTimeout(timer)) }, [])

  const save = (next: Vote) => {
    setVote(next)
    try { localStorage.setItem(key, JSON.stringify(next)) }
    catch { setNotice('투표 내용을 저장하지 못했어요.') }
  }
  const eliminate = (id: string) => {
    if (vote.excluded.includes(id)) return
    setHistory(previous => [...previous, vote])
    save({ reviewed: [...new Set([...vote.reviewed, id])], excluded: [...vote.excluded, id] })
    setNotice('')
  }
  const resetDrag = (card: HTMLElement) => { card.style.transition = 'transform 160ms cubic-bezier(.2,.8,.2,1)'; card.style.transform = '' }
  const animateEliminate = (id: string, card?: HTMLElement) => {
    if (vote.excluded.includes(id)) return
    const target = card || rows.current.get(id)?.querySelector<HTMLElement>('.food-card')
    if (target) { target.style.transition = 'transform 200ms cubic-bezier(.2,.8,.2,1)'; target.style.transform = 'translate3d(-110%, 0, 0)' }
    setExiting(previous => [...previous, id])
    eliminate(id)
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timer = window.setTimeout(() => {
      setExiting(previous => previous.filter(item => item !== id))
      window.requestAnimationFrame(() => { target?.style.removeProperty('transition'); target?.style.removeProperty('transform') })
      exitTimers.current.delete(id)
    }, reducedMotion ? 0 : 200)
    exitTimers.current.set(id, timer)
  }
  const cancelExit = (id: string) => {
    window.clearTimeout(exitTimers.current.get(id))
    exitTimers.current.delete(id)
    setExiting(previous => previous.filter(item => item !== id))
    const card = rows.current.get(id)?.querySelector<HTMLElement>('.food-card')
    if (card) resetDrag(card)
  }
  const restore = (id: string) => {
    if (!vote.excluded.includes(id)) return
    cancelExit(id)
    setHistory(previous => [...previous, vote])
    save({ reviewed: [...new Set([...vote.reviewed, id])], excluded: vote.excluded.filter(item => item !== id) })
    setNotice('')
  }
  const undo = () => {
    const last = history.at(-1)
    if (!last) return
    const changedId = vote.excluded.find(id => !last.excluded.includes(id)) || last.excluded.find(id => !vote.excluded.includes(id))
    if (changedId) cancelExit(changedId)
    save(last)
    setHistory(previous => previous.slice(0, -1))
    setNotice('최근 소거·복구 동작을 취소했어요.')
  }
  const confirm = (id: string) => {
    if (!vote.reviewed.includes(id)) save({ ...vote, reviewed: [...vote.reviewed, id] })
  }

  return <main className="onboarding vote-screen">
    <header className="preferences-header">
      <button onClick={onBack} aria-label="파티 대기실로 돌아가기">〈 <span>대기실</span></button>
      <span className="preferences-logo"><img src={asset('logo.png')} alt="시로 XIRO" /></span>
      <button className="undo-button" disabled={!history.length} onClick={undo}><img src={asset('return.png')} alt="" /> 되돌리기</button>
    </header>
    <section className="review-banner">
      <small>{party.place} 반경 {formatRadius(party.radiusKm * 1000)}</small>
      <h1>메뉴 확인 <b>{vote.reviewed.length}<span>/{candidates.length}</span></b></h1>
      <progress value={vote.reviewed.length} max={candidates.length || 1} aria-label="메뉴 확인 진행률" />
      <img src={asset('mascot.png')} alt="주먹밥 캐릭터" />
    </section>
    <div className="swipe-guide"><span>≪</span><p><small>이번 모임에서 먹고 싶지 않은 메뉴가 있나요? · 소거 {vote.excluded.length}개</small><strong>왼쪽으로 밀어 소거해 주세요!</strong></p></div>
    <ul className="food-list">{candidates.map(food => {
      const excluded = vote.excluded.includes(food.id)
      const reviewed = vote.reviewed.includes(food.id)
      const isExiting = exiting.includes(food.id)
      return <li key={food.id} ref={element => { if (element) rows.current.set(food.id, element); else rows.current.delete(food.id) }} className={`food-row ${excluded && !isExiting ? 'is-collapsed' : ''} ${isExiting ? 'is-exiting' : ''}`}>
        <div className="swipe-reveal" aria-hidden="true">제외</div>
        <article className="food-card"
          onPointerDown={event => {
            if ((event.target as HTMLElement).closest('button')) return
            pointer.current = { id: food.id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, axis: 'pending', card: event.currentTarget }
          }}
          onPointerMove={event => {
            const gesture = pointer.current
            if (!gesture || gesture.id !== food.id || gesture.pointerId !== event.pointerId) return
            const dx = event.clientX - gesture.x
            const dy = event.clientY - gesture.y
            if (gesture.axis === 'pending') {
              if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) gesture.axis = 'vertical'
              else if (dx < -8 && Math.abs(dx) > Math.abs(dy) * 1.2) {
                gesture.axis = 'horizontal'
                event.currentTarget.setPointerCapture(event.pointerId)
              }
            }
            if (gesture.axis === 'horizontal') {
              event.preventDefault()
              event.currentTarget.style.transition = 'none'
              event.currentTarget.style.transform = `translate3d(${Math.max(-event.currentTarget.clientWidth, Math.min(0, dx))}px, 0, 0)`
            }
          }}
          onPointerUp={event => {
            const gesture = pointer.current
            if (!gesture || gesture.id !== food.id || gesture.pointerId !== event.pointerId) return
            if (gesture.axis === 'horizontal') {
              const dx = event.clientX - gesture.x
              const threshold = Math.min(96, event.currentTarget.clientWidth * 0.28)
              if (dx <= -threshold) animateEliminate(food.id, event.currentTarget)
              else resetDrag(event.currentTarget)
              if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
            }
            pointer.current = null
          }}
          onPointerCancel={() => { if (pointer.current?.axis === 'horizontal') resetDrag(pointer.current.card); pointer.current = null }}
        >
          <img className="food-photo" src={asset(food.image)} alt={food.name} draggable={false} />
          <div className="food-info"><h2>{food.name}</h2><p>{food.description}</p><strong>{food.price}</strong><small>{food.detail}</small><div className="food-controls"><span>{excluded ? '소거됨' : reviewed ? '확인 · 후보' : '미확인'}</span>{!reviewed && <button onClick={() => confirm(food.id)}>확인</button>}<button onClick={() => animateEliminate(food.id)}>소거</button></div></div>
          <span className="swipe-handle" aria-hidden="true">❮❮</span>
        </article>
      </li>
    })}</ul>
    {vote.excluded.length > 0 && <section className="excluded-tray"><h2>소거한 메뉴</h2><div>{candidates.filter(food => vote.excluded.includes(food.id)).map(food => <button key={food.id} onClick={() => restore(food.id)}>{food.name} · 다시 포함</button>)}</div></section>}
    {candidates.length === 0 && <p className="empty-candidates">이 파티 조건에 맞는 메뉴가 없어요. 대기실에서 조건을 확인해 주세요.</p>}
    <p role="status" className="vote-notice">{notice}</p>
    <nav className="bottom-nav" aria-label="하단 내비게이션">
      <button aria-label="프로필" onClick={() => setPanel('profile')}><svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="currentColor"/><circle cx="16" cy="11" r="5" fill="#ff9598"/><path d="M7 25c0-10 18-10 18 0" fill="#ff9598"/></svg></button>
      <button className="party-plus" aria-label="현재 파티 정보" onClick={() => setPanel('party')}>＋</button>
      <button aria-label="홈" onClick={onHome}><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M2 14 16 2l14 12v16H20V19h-8v11H2Z" fill="currentColor"/></svg></button>
    </nav>
    {panel && <div className="panel-backdrop"><section className="demo-panel" role="dialog" aria-modal="true" aria-labelledby="vote-panel-title">
      <h2 id="vote-panel-title">{panel === 'profile' ? '내 프로필' : party.name}</h2>
      {panel === 'profile' ? <p>닉네임: <strong>{nickname}</strong></p> : <p>{party.place} · 반경 {party.radiusKm}km · {party.budgetMax.toLocaleString()}원 이하</p>}
      <button className="primary" autoFocus onClick={() => setPanel(null)}>닫기</button>
    </section></div>}
  </main>
}
