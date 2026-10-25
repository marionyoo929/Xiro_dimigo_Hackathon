import { useCallback, useEffect, useRef, useState } from 'react'
import { api, allPages, subscribe, type StreamEvent } from '../lib/api'
import type { CategoryCandidate, Party, RestaurantCandidate, RestrictionCollection, ReviewProgress, User, Job, InviteLink } from '../types/api'
import { Header, stateLabel } from '../App'
import LiveReview from './LiveReview'
import LiveCategoryReview from './LiveCategoryReview'
import DietaryRestrictions from './DietaryRestrictions'
import OrderPage from './OrderPage'
import PlaceMap from '../components/PlaceMap'
import StoreQrScanner from '../components/StoreQrScanner'

export default function LiveParty({ id, user, onHome, onEdit }: { id: string; user: User; onHome: () => void; onEdit: (party: Party) => void }) {
  const [party, setParty] = useState<Party | null>(null), [candidates, setCandidates] = useState<(CategoryCandidate | RestaurantCandidate)[]>([]), [progress, setProgress] = useState<ReviewProgress | null>(null)
  const [restrictions, setRestrictions] = useState<RestrictionCollection | null>(null), [job, setJob] = useState<Job | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [connected, setConnected] = useState(false)
  const [invite, setInvite] = useState(''), [qrScannerOpen, setQrScannerOpen] = useState(false), [notice, setNotice] = useState(''), [editingRestrictions, setEditingRestrictions] = useState(false), [displayName, setDisplayName] = useState('')
  const sequence = useRef(0), terminal = useRef(false), mounted = useRef(true), actionLock = useRef(false)
  const base = `/parties/${encodeURIComponent(id)}`
  const load = useCallback(async (rethrow = false) => {
    if (terminal.current) return
    const request = ++sequence.current
    try {
      const p = await api<Party>(base)
      const kind = p.state.startsWith('CATEGORY') ? 'category' : p.state.startsWith('RESTAURANT') ? 'restaurant' : null
      const hasSet = kind && p.candidateSets.some(s => s.kind === kind.toUpperCase())
      const [items, status, r, j] = await Promise.all([
        hasSet ? allPages<CategoryCandidate | RestaurantCandidate>(`${base}/${kind}-candidates`) : Promise.resolve([]),
        hasSet ? api<ReviewProgress>(`${base}/${kind}-review/progress`) : Promise.resolve(null),
        p.state === 'WAITING' ? api<RestrictionCollection>('/me/dietary-restrictions') : Promise.resolve(null),
        p.generationJobId ? api<Job>(`/jobs/${p.generationJobId}`) : Promise.resolve(null),
      ])
      if (request !== sequence.current || !mounted.current || terminal.current) return
      setParty(p); setCandidates(items); setProgress(status); setRestrictions(r); setJob(j)
    } catch (e) { if (request === sequence.current && mounted.current && !terminal.current) setError((e as Error).message); if (rethrow) throw e }
  }, [base])
  useEffect(() => {
    mounted.current = true; void load()
    const event = (e: StreamEvent) => {
      if (e.type === 'review.reset') setNotice('소거 후보가 바뀌어 검토 완료가 해제됐어요. 후보를 다시 확인하고 완료해 주세요.')
      const state = e.data?.state
      if (typeof state === 'string' && ['ORDER_CONFIRMED', 'ORDER_REJECTED', 'CANCELED'].includes(state)) {
        terminal.current = true; setParty(p => p ? { ...p, state: state as Party['state'] } : p)
      } else void load()
    }
    const stop = subscribe(base, event, () => void load(), setConnected)
    const focus = () => void load(); window.addEventListener('focus', focus)
    return () => { mounted.current = false; sequence.current++; stop(); window.removeEventListener('focus', focus) }
  }, [base, load])
  const run = async (action: () => Promise<void>): Promise<boolean> => {
    if (actionLock.current) return false
    actionLock.current = true; setBusy(true); setError(''); setNotice('')
    try { await action(); await load(); return true } catch (e) { setError((e as Error).message); await load(); return false } finally { actionLock.current = false; if (mounted.current) setBusy(false) }
  }
  if (editingRestrictions) return <DietaryRestrictions onBack={() => { setEditingRestrictions(false); void load() }} />
  if (!party) return <main className="onboarding flow-screen"><Header title="파티" onHome={onHome} /><p role="status">{error || '파티를 불러오는 중…'}</p><button className="secondary" onClick={() => void load()}>다시 불러오기</button></main>
  const me = party.members.find(m => m.id === party.myMemberId)!, isHost = party.hostMemberId === me.id
  if (party.orderId && party.state !== 'CANCELED') return <OrderPage id={party.orderId} user={user} isHost={isHost} onHome={onHome} />
  const command = (path: string, body?: unknown, version?: number, method = 'POST') => run(async () => { await api(`${base}${path}`, { method, body, version }) })
  const confirm = () => command('/members/me/dietary-confirmation', { confirmed: !me.restrictionConfirmed, restrictionRevision: restrictions!.revision }, undefined, 'PUT')
  const share = () => void run(async () => {
    const link = await api<InviteLink>(`${base}/invite-links`, { method: 'POST', body: {} })
    const url = new URL(link.inviteUrl); url.host = window.location.host; url.protocol = window.location.protocol
    setInvite(url.toString()); try { await navigator.clipboard.writeText(url.toString()); setNotice('초대 링크를 복사했어요.') } catch { setNotice('아래 초대 링크를 복사해 주세요.') }
  })
  const location = { id: party.id, name: party.location.address || party.title, address: party.location.address || '', latitude: party.location.latitude, longitude: party.location.longitude, url: '', category: '' }
  if (party.state === 'CATEGORY_REVIEW' && progress) return <LiveCategoryReview key={progress.candidateSetId} party={party} candidates={candidates.filter((c): c is CategoryCandidate => 'category' in c)} progress={progress} busy={busy} isHost={isHost} nickname={me.displayName} error={error} resetNotice={notice} onHome={onHome} onCommand={command} onRefresh={() => load(true)} />
  return <main className={`onboarding flow-screen ${party.state === 'WAITING' ? 'waiting-screen' : ''}`}><Header title={party.title} user={{ ...user, displayName: me.displayName }} onHome={onHome} /><div className="stage-line"><span>{stateLabel(party.state)}</span><small className={connected ? 'connection-on' : 'connection-off'}>{connected ? '실시간 연결됨' : '연결 복구 중'}</small></div>
    {error && !qrScannerOpen && <p className="error-box" role="alert">{error}</p>}{notice && <p role="status" className="notice-box">{notice}</p>}
    {party.state === 'WAITING' && <>
      <section className="summary-card waiting-summary"><h1>함께 먹을 준비됐나요?</h1><p className="waiting-location">{party.location.address}</p>{party.scheduledAt && <p className="waiting-conditions">약속 시간 {new Date(party.scheduledAt).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })}</p>}<p className="waiting-conditions">반경 {party.searchRadiusMeters}m <span aria-hidden="true">·</span> {party.budgetPerPerson === null ? '예산 제한 없음' : `1인 ${party.budgetPerPerson.toLocaleString()}원 이하`}</p><div className="button-row waiting-actions">{isHost && <button className="secondary" disabled={busy} onClick={() => onEdit(party)}>장소·조건 변경</button>}{isHost && <button className="secondary" disabled={busy} onClick={share}>초대 링크 복사</button>}</div>{invite && <label>초대 링크<input aria-label="초대 링크" readOnly value={invite} onFocus={e => e.target.select()} /></label>}</section>
      <section className="summary-card waiting-restrictions"><h2>내 식사 제한 확인</h2><p>{restrictions?.items.length ? restrictions.items.map(r => r.label).join(', ') : '등록한 식사 제한이 없어요.'}</p><button className="text-button" onClick={() => setEditingRestrictions(true)}>제한 목록 수정</button><button className="primary restriction-confirm-button" disabled={busy || !restrictions} onClick={() => void confirm()}>{me.restrictionConfirmed ? '제한 확인 취소' : '최신 식사 제한 확인'}</button></section>
      <section className="waiting-members"><h2>참가자 {party.memberCount}/{party.maxMembers}</h2><ul className="member-list">{party.members.map(m => <li key={m.id}><div className="member-identity"><div className="member-name-row"><span className="member-name" title={m.displayName}>{m.displayName}</span>{m.role === 'HOST' && <span className="member-host">방장</span>}</div><small>{m.connectionStatus === 'ONLINE' ? '접속 중' : '오프라인'}</small></div><span className={`member-readiness ${m.restrictionConfirmed ? 'is-ready' : ''}`}>{m.restrictionConfirmed ? '제한 확인 완료' : '제한 확인 대기'}</span>{isHost && m.id !== me.id && <button className="text-button danger" disabled={busy} onClick={() => void command(`/members/${m.id}`, undefined, undefined, 'DELETE')}>내보내기</button>}</li>)}</ul>
        <form className="button-row member-name-form" onSubmit={e => { e.preventDefault(); if (displayName.trim()) void command('/members/me', { displayName: displayName.trim() }, undefined, 'PATCH') }}><input aria-label="내 닉네임 변경" placeholder={me.displayName} maxLength={30} value={displayName} onChange={e => setDisplayName(e.target.value)} /><button className="secondary" disabled={busy || !displayName.trim()}>이름 변경</button></form></section>
      {job?.status === 'FAILED' && <p className="error-box" role="status">{job.error?.message}</p>}
      {isHost ? <button className="primary" disabled={busy || party.members.some(m => !m.restrictionConfirmed)} onClick={() => void command('/category-candidates/generate')}>음식 후보 생성</button> : <p className="muted">방장이 음식 후보를 생성할 때까지 기다려 주세요.</p>}
      {!isHost && <button className="text-button danger" disabled={busy} onClick={() => void run(async () => { await api(`${base}/members/${me.id}`, { method: 'DELETE' }); onHome() })}>파티 나가기</button>}
    </>}
    {party.state.endsWith('_GENERATING') && <section className="summary-card"><h1>우리 모임에 맞는 후보를 찾고 있어요</h1><p role="status">등록 메뉴, 거리, 예산, 식사 제한을 확인하고 있어요.</p><button className="secondary" onClick={() => void load()}>진행 상태 새로고침</button></section>}
    {party.state === 'ORDERING' && !party.orderId && <section className="summary-card"><h1>주문 연결을 확인해 주세요</h1><p>매장에 연결된 주문 초안을 다시 불러올 수 있어요.</p>{isHost ? <button className="primary" disabled={busy} onClick={() => void command('/orders')}>주문 다시 연결</button> : <p>방장이 주문을 다시 연결하고 있어요.</p>}</section>}
    {(party.state === 'CATEGORY_REVIEW' || party.state === 'RESTAURANT_REVIEW') && progress && <LiveReview key={progress.candidateSetId} party={party} candidates={candidates} progress={progress} busy={busy} isHost={isHost} onCommand={command} onRefresh={() => load(true)} />}
    {party.state === 'CATEGORY_FINALIZED' && <section className="summary-card"><h1>음식 검토를 마쳤어요</h1><p>남은 음식을 판매하는 식당을 찾아볼까요?</p>{isHost && <button className="primary" disabled={busy} onClick={() => void command('/restaurant-candidates/generate')}>식당 후보 생성</button>}{job?.status === 'FAILED' && <p role="alert">{job.error?.message}</p>}</section>}
    {party.state === 'RESTAURANT_FINALIZED' && <><h1>방문할 식당을 골라요</h1>{!isHost && <p>방장이 최종 식당을 선택하고 있어요.</p>}{candidates.filter(c => 'restaurant' in c && c.status === 'ACTIVE').map(c => 'restaurant' in c && <section className="summary-card" key={c.id}><h2>{c.restaurant.name}</h2><p>{c.restaurant.distanceMeters}m · {c.restaurant.location.address}</p><p>{c.representativeMenus.map(m => m.name).join(', ')}</p>{isHost && <button className="primary" disabled={busy} onClick={() => void command('/selected-restaurant', { restaurantCandidateId: c.id }, party.version, 'PUT')}>이 식당 선택</button>}</section>)}</>}
    {party.state === 'RESTAURANT_SELECTED' && <section className="summary-card"><h1>방문할 식당을 정했어요!</h1>{candidates.map(c => 'restaurant' in c && c.restaurant.id === party.selectedRestaurantId && <div key={c.id}><h2>{c.restaurant.name}</h2><p>{c.restaurant.location.address}</p><div className="waiting-place-map"><PlaceMap selected={{ ...location, id: c.restaurant.id, name: c.restaurant.name, ...c.restaurant.location, address: c.restaurant.location.address || '' }} radiusKm={0.2} /></div><a href={`https://map.kakao.com/link/map/${encodeURIComponent(c.restaurant.name)},${c.restaurant.location.latitude},${c.restaurant.location.longitude}`} target="_blank" rel="noreferrer">카카오맵에서 보기 ↗</a></div>)}<p>{isHost ? '매장에 도착하면 주문 QR을 스캔해 주세요.' : '방장이 매장 QR을 스캔하면 함께 주문을 시작할 수 있어요.'}</p>{isHost && <button className="primary" disabled={busy} onClick={() => setQrScannerOpen(true)}>카메라로 매장 QR 스캔</button>}</section>}
    {['ORDER_CONFIRMED', 'ORDER_REJECTED', 'CANCELED'].includes(party.state) && <section className="summary-card"><h1>{stateLabel(party.state)}</h1><p>{party.state === 'ORDER_CONFIRMED' ? '식당이 주문을 수락했어요. 결제는 매장에서 진행해 주세요.' : party.state === 'ORDER_REJECTED' ? '식당이 주문을 거절했어요. 주문 상세에서 사유를 확인해 주세요.' : '파티가 취소됐어요.'}</p><button className="primary" onClick={onHome}>홈으로 돌아가기</button></section>}
    {isHost && !['ORDER_SUBMITTED', 'ORDER_CONFIRMED', 'ORDER_REJECTED', 'CANCELED'].includes(party.state) && <details className="danger-zone"><summary>파티 관리</summary><button className="danger secondary" disabled={busy} onClick={() => void command('', undefined, party.version, 'DELETE')}>파티 취소</button></details>}
    {qrScannerOpen && party.state === 'RESTAURANT_SELECTED' && isHost && <StoreQrScanner connectionError={error} onClose={() => setQrScannerOpen(false)} onScan={async token => { const connected = await command('/store-connection', { qrToken: token }, party.version); if (connected) setQrScannerOpen(false); return connected }} />}
  </main>
}
