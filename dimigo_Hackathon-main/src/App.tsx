import { randomId } from './lib/randomId'
import { useEffect, useState, type ReactNode } from 'react'
import CreateParty from './pages/CreateParty'
import Onboarding from './pages/Onboarding'
import MenuVote from './pages/MenuVote'
import LiveParty from './pages/LiveParty'
import Merchant from './pages/Merchant'
import DietaryRestrictions from './pages/DietaryRestrictions'
import OrderPage from './pages/OrderPage'
import StoreQrScanner from './components/StoreQrScanner'
import CustomerProfile from './pages/CustomerProfile'
import type { CustomerProfile as Profile, ProfileResponse } from './types/customerStats'
import { sampleParty, type Party as LegacyParty, type PartySettings } from './data/sampleParty'
import { ApiError, api, allPages, currentUser, demoLogin, localLogin, logout, setSession } from './lib/api'
import type { GuestOrderSession, GuestSession, Member, Party, StoreQrInfo, User } from './types/api'
import './styles/onboarding.css'
import './styles/flow.css'

function navigate(path: string) { history.pushState(null, '', path); window.dispatchEvent(new PopStateEvent('popstate')) }
export default function App() {
  const [path, setPath] = useState(window.location.pathname), [user, setUser] = useState<User | null>(currentUser)
  const [sessionReady, setSessionReady] = useState(() => currentUser() === null)
  const [sessionFailed, setSessionFailed] = useState(false), [sessionAttempt, setSessionAttempt] = useState(0)
  const [demo, setDemo] = useState(false), [serverReady, setServerReady] = useState(false)
  const [serverFailed, setServerFailed] = useState(false), [serverAttempt, setServerAttempt] = useState(0)
  const [localAuth, setLocalAuth] = useState(false)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [name, setName] = useState('')
  const [parties, setParties] = useState<Party[]>([]), [editing, setEditing] = useState<Party | null>(null)
  const [qrScannerOpen, setQrScannerOpen] = useState(false)
  const [profile, setProfile] = useState<{ userId: string; value: Profile | null } | null>(null)
  const [profileError, setProfileError] = useState(''), [profileAttempt, setProfileAttempt] = useState(0)
  useEffect(() => { const change = () => { setPath(window.location.pathname); setError('') }; window.addEventListener('popstate', change); return () => window.removeEventListener('popstate', change) }, [])
  useEffect(() => {
    let active = true
    setServerFailed(false)
    void api<{ demo: boolean; localAuth: boolean }>('/health', { expectJson: true }).then(r => {
      if (active) { setDemo(r.demo); setLocalAuth(r.localAuth); setServerReady(true) }
    }).catch(e => { if (active) { setServerReady(false); setServerFailed(true); setError(e.message) } })
    return () => { active = false }
  }, [serverAttempt])
  useEffect(() => {
    if (!currentUser()) return
    let active = true
    setSessionFailed(false)
    void api<User>('/me', { expectJson: true }).then(account => { if (active) { setUser(account); setSessionReady(true) } }).catch(e => {
      if (!active) return
      if (e instanceof ApiError && e.status === 401) { setSession(null); setUser(null); setSessionReady(true) }
      else setSessionFailed(true)
      setError(e instanceof Error ? e.message : '로그인 상태를 확인하지 못했어요.')
    })
    return () => { active = false }
  }, [sessionAttempt])
  useEffect(() => {
    let active = true
    setProfile(null); setProfileError('')
    if (user && sessionReady) void api<ProfileResponse>('/me/profile', { expectJson: true }).then(result => {
      if (active) setProfile({ userId: user.id, value: result.profile })
    }).catch(e => { if (active) setProfileError(e.message) })
    return () => { active = false }
  }, [user?.id, sessionReady, profileAttempt])
  useEffect(() => { if (user && sessionReady && path === '/') void allPages<Party>('/me/parties').then(setParties).catch(e => setError(e.message)) }, [user, sessionReady, path])
  async function run(action: () => Promise<void>) { if (busy) return; setBusy(true); setError(''); try { await action() } catch (e) { setError(e instanceof Error ? e.message : '요청에 실패했어요.') } finally { setBusy(false) } }
  const home = () => navigate('/')
  const signout = () => void run(async () => { try { await logout() } finally { setUser(null); setEditing(null); home() } })
  if (import.meta.env.DEV && path === '/dev/sample-party/menu') return <MenuVote party={sampleParty} participantId="sample-participant-01" nickname="샘플" onBack={home} onHome={home} />
  if (path === '/merchant-preview' && !user && demo) return <Merchant user={null} preview onHome={home} />
  const inviteToken = path.startsWith('/invite/') ? decodeURIComponent(path.slice(8)) : null
  const qrToken = path.startsWith('/store/') ? decodeURIComponent(path.slice(7)) : null
  const partyId = path.startsWith('/party/') ? decodeURIComponent(path.slice(7)) : null
  const orderId = path.startsWith('/order/') ? decodeURIComponent(path.slice(7)) : null
  const errorBanner = error && <div className="app-error" role="alert">{error}<button aria-label="오류 메시지 닫기" onClick={() => setError('')}>×</button></div>
  if (user && !sessionReady) return <main className="onboarding flow-screen"><Header title="시로" /><p role="status">{sessionFailed ? '로그인 상태를 확인하지 못했어요.' : '로그인 상태를 확인하는 중…'}</p>{errorBanner}{sessionFailed && <button className="secondary" onClick={() => { setError(''); setSessionAttempt(value => value + 1) }}>다시 연결</button>}</main>
  if (user && !(path === '/merchant' && user.roles.includes('MERCHANT'))) {
    if (profile?.userId !== user.id) return <main className="onboarding flow-screen"><Header title="내 기본 정보" /><p role="status">{profileError ? '기본 정보를 확인하지 못했어요.' : '기본 정보를 확인하는 중…'}</p>{profileError && <><p role="alert" className="error-box">{profileError}</p><button className="secondary" onClick={() => setProfileAttempt(value => value + 1)}>기본 정보 다시 확인</button></>}<button className="text-button" onClick={signout}>로그아웃</button></main>
    if (!profile.value || path === '/profile') return <CustomerProfile key={user.id} initial={profile.value} onSaved={value => { setProfile({ userId: user.id, value }); if (path === '/profile') home() }} onBack={profile.value ? home : signout} />
  }
  if (inviteToken) return <Entry title="함께 먹을 메뉴를 골라요" description="초대받은 파티에 참여하세요." name={name} setName={setName} busy={busy} error={errorBanner} onSubmit={() => void run(async () => {
    if (user?.principalType === 'USER') {
      const joinedMember = await api<Member>(`/party-invites/${encodeURIComponent(inviteToken)}/join`, { method: 'POST' })
      const joined = (await allPages<Party>('/me/parties')).find(p => p.myMemberId === joinedMember.id)
      if (!joined) throw new Error('참여한 파티를 찾지 못했어요.')
      const displayName = name.trim()
      if (displayName && displayName !== joinedMember.displayName && joined.state === 'WAITING') {
        await api<Member>(`/parties/${joined.id}/members/me`, { method: 'PATCH', body: { displayName } })
      }
      navigate(`/party/${joined.id}`)
    } else {
      const result = await api<GuestSession>('/guest-sessions', { method: 'POST', body: { inviteToken, displayName: name.trim() || '게스트', deviceId: randomId() } })
      setSession(result); setUser(result.guestUser); navigate(`/party/${result.partyId}`)
    }
  })} submit={user?.principalType === 'USER' ? `${name.trim() || user.displayName}님으로 참여` : '게스트로 참여'} onHome={home} />
  if (qrToken) return <QrEntry token={qrToken} user={user} onSession={value => { setSession(value); setUser(value.guestUser); navigate(`/order/${value.order.id}`) }} onParty={id => navigate(`/party/${id}`)} onHome={home} />
  if (!user) return <Onboarding demo={demo} localAuth={localAuth} ready={serverReady} connectionFailed={serverFailed} onRetryConnection={() => { setError(''); setServerAttempt(value => value + 1) }} busy={busy} error={error}
    onStart={nickname => void run(async () => { setUser(await demoLogin(nickname)); home() })}
    onLocalLogin={(loginEmail, loginPassword) => void run(async () => { setUser(await localLogin(loginEmail, loginPassword)); home() })}
    onMerchantDemo={() => void run(async () => { setUser(await demoLogin('시연 사장님', true)); navigate('/merchant') })} />
  if (path === '/create') {
    const initial: LegacyParty | null = editing ? { id: editing.id, name: editing.title, place: editing.location.address || editing.title, location: { id: editing.id, name: editing.location.address?.split('\n')[0] || editing.title, address: editing.location.address || '', latitude: editing.location.latitude, longitude: editing.location.longitude, url: '', category: '' }, radiusKm: editing.searchRadiusMeters / 1000, budgetMax: editing.budgetPerPerson ?? 25000, budgetPerPerson: editing.budgetPerPerson, scheduledAt: editing.scheduledAt, candidates: [] } : null
    const create = (settings: PartySettings) => void run(async () => {
      const body = { title: settings.name, location: { latitude: settings.location.latitude, longitude: settings.location.longitude, address: settings.location.address }, searchRadiusMeters: Math.round(settings.radiusKm * 1000), budgetPerPerson: settings.budgetPerPerson === undefined ? settings.budgetMax : settings.budgetPerPerson, scheduledAt: settings.scheduledAt || null, mealStyle: 'INDIVIDUAL_ORDER' }
      const result = await api<Party>(editing ? `/parties/${editing.id}` : '/parties', { method: editing ? 'PATCH' : 'POST', body, version: editing?.version })
      setEditing(null); navigate(`/party/${result.id}`)
    })
    return <>{errorBanner}<CreateParty key={editing?.id || 'new'} initialParty={initial} nickname={user.displayName} onNext={create} onBack={() => navigate(editing ? `/party/${editing.id}` : '/')} onHome={home} demo={demo} busy={busy} /></>
  }
  if (path === '/restrictions') return <DietaryRestrictions onBack={home} />
  if (path === '/merchant') return <Merchant user={user} onHome={home} onLogout={signout} />
  if (partyId) return <LiveParty key={partyId} id={partyId} user={user} onHome={home} onEdit={p => { setEditing(p); navigate('/create') }} />
  if (orderId) return <OrderPage key={orderId} id={orderId} user={user} onHome={home} />
  return <main className="onboarding flow-screen home-screen"><Header title="시로" user={user} onLogout={signout} />{errorBanner}
    <section className="welcome-card"><div className="welcome-main"><h1>싫은 건 빼고,<br />맛있는 것만 남겨요</h1><img src="/images/mascot.png" alt="" /></div></section>
    {user.principalType === 'USER' && <button className="primary home-create-button" aria-label="＋ 파티 만들기" onClick={() => { setEditing(null); navigate('/create') }}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v14M3 10h14" /></svg><span>파티 만들기</span></button>}
    <button className="secondary" onClick={() => navigate('/restrictions')}>내 식사 제한 관리</button>
    <button className="secondary" onClick={() => navigate('/profile')}>내 기본 정보 수정</button>
    {user.principalType === 'USER' && <button className="secondary" onClick={() => setQrScannerOpen(true)}>매장 QR 스캔</button>}
    {user.roles.includes('MERCHANT') && <button className="secondary" onClick={() => navigate('/merchant')}>사장님 매장 관리</button>}
    <h2>내 파티</h2>{parties.length === 0 && <p className="muted">아직 참여한 파티가 없어요. 초대 링크로도 참여할 수 있어요.</p>}
    <div className="stack">{parties.map(p => <button className="party-card" key={p.id} onClick={() => navigate(`/party/${p.id}`)}><strong>{p.title}</strong><span>{p.members.length}명 · {stateLabel(p.state)}</span><small>{p.location.address}</small></button>)}</div>
    {qrScannerOpen && <StoreQrScanner onClose={() => setQrScannerOpen(false)} onScan={async token => { setQrScannerOpen(false); navigate(`/store/${encodeURIComponent(token)}`); return true }} />}
  </main>
}
export function Header({ title, user, onHome, onLogout }: { title: string; user?: User; onHome?: () => void; onLogout?: () => void }) {
  return <header className="flow-header">{onHome && <button className="text-button" onClick={onHome}>〈 홈</button>}<strong>{title}</strong>{onLogout ? <button className="text-button" onClick={onLogout}>로그아웃</button> : user && <span>{user.displayName}</span>}</header>
}
export function stateLabel(state: string) { return ({ WAITING: '참가자 대기', CATEGORY_GENERATING: '음식 후보 생성 중', CATEGORY_REVIEW: '음식 소거', CATEGORY_FINALIZED: '음식 확정', RESTAURANT_GENERATING: '식당 후보 생성 중', RESTAURANT_REVIEW: '식당 소거', RESTAURANT_FINALIZED: '최종 식당 선택', RESTAURANT_SELECTED: '방문할 식당 확정', ORDERING: '메뉴 선택', ORDER_SUBMITTED: '식당 접수 대기', ORDER_CONFIRMED: '식당 주문 수락 완료', ORDER_REJECTED: '식당 주문 거절', CANCELED: '취소됨' } as Record<string, string>)[state] || state }
function Entry({ title, description, name, setName, onSubmit, busy, error, submit, disabled, children, onHome, credentials }: { title: string; description: string; name: string; setName: (value: string) => void; onSubmit: () => void; busy: boolean; error: ReactNode; submit: string; disabled?: boolean; children?: ReactNode; onHome: () => void; credentials?: ReactNode }) {
  return <main className="onboarding flow-screen entry-screen"><Header title="XIRO" onHome={onHome} /><img className="entry-mascot" src="/images/mascot.png" alt="시로 주먹밥" /><h1>{title}</h1><p className="muted">{description}</p>{error}<form className="stack" onSubmit={e => { e.preventDefault(); onSubmit() }}>{credentials || <label>닉네임<input maxLength={30} value={name} onChange={e => setName(e.target.value)} placeholder="닉네임을 입력해 주세요" /></label>}<button className="primary" disabled={busy || disabled}>{busy ? '연결 중…' : submit}</button></form>{children}</main>
}
function QrEntry({ token, user, onSession, onParty, onHome }: { token: string; user: User | null; onSession: (session: GuestOrderSession) => void; onParty: (id: string) => void; onHome: () => void }) {
  const [info, setInfo] = useState<StoreQrInfo | null>(null), [name, setName] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [parties, setParties] = useState<Party[]>([]), [selectedId, setSelectedId] = useState(''), [partyError, setPartyError] = useState(''), [partiesLoading, setPartiesLoading] = useState(false)
  const [infoAttempt, setInfoAttempt] = useState(0), [partyAttempt, setPartyAttempt] = useState(0), [infoFailed, setInfoFailed] = useState(false)
  useEffect(() => {
    let active = true
    setInfo(null); setInfoFailed(false); setError('')
    void api<StoreQrInfo>(`/store-qr/${encodeURIComponent(token)}`).then(value => { if (active) setInfo(value) }).catch(e => { if (active) { setError(e.message); setInfoFailed(true) } })
    return () => { active = false }
  }, [token, infoAttempt])
  useEffect(() => {
    let active = true
    setParties([]); setPartyError('')
    if (user?.principalType !== 'USER') { setPartiesLoading(false); return }
    setPartiesLoading(true)
    void allPages<Party>('/me/parties').then(list => { if (active) setParties(list) }).catch(e => { if (active) setPartyError(e.message) }).finally(() => { if (active) setPartiesLoading(false) })
    return () => { active = false }
  }, [user?.id, user?.principalType, partyAttempt])
  const eligible = parties.filter(p => p.state === 'RESTAURANT_SELECTED' && p.myMemberId === p.hostMemberId && p.selectedRestaurantId === info?.restaurantId)
  const selected = eligible.find(p => p.id === selectedId) || eligible[0]
  const run = async (action: () => Promise<void>) => { if (busy) return; setBusy(true); setError(''); try { await action() } catch (e) { setError((e as Error).message); setPartyAttempt(value => value + 1) } finally { setBusy(false) } }
  return <Entry title={info?.restaurantName || '매장 QR 확인'} description={!info ? infoFailed ? '매장 QR 정보를 불러오지 못했어요.' : '매장 QR을 확인하는 중…' : info.orderEnabled ? '메뉴를 고르고 식당에 주문을 전달해요.' : '지금은 주문을 시작할 수 없어요.'} name={name} setName={setName} busy={busy} error={error && <p role="alert">{error}</p>} disabled={!info?.orderEnabled} submit="일반 주문 시작" onHome={onHome} onSubmit={() => void run(async () => onSession(await api<GuestOrderSession>(`/store-qr/${encodeURIComponent(token)}/guest-order-sessions`, { method: 'POST', body: { displayName: name.trim() || '방문 손님', deviceId: randomId() } })))}>
    {infoFailed && <button className="secondary" disabled={busy} onClick={() => setInfoAttempt(value => value + 1)}>매장 QR 다시 확인</button>}
    {partiesLoading && <p className="muted" role="status">연결할 파티를 확인하는 중… 일반 주문도 시작할 수 있어요.</p>}
    {partyError && <div className="stack"><p className="muted" role="status">파티 목록을 불러오지 못했어요. 일반 주문은 시작할 수 있어요.</p><button className="secondary" disabled={busy} onClick={() => setPartyAttempt(value => value + 1)}>파티 목록 다시 불러오기</button></div>}
    {eligible.length > 1 && <label>연결할 파티<select aria-label="연결할 파티" value={selected.id} disabled={busy} onChange={e => setSelectedId(e.target.value)}>{eligible.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label>}
    {selected && <button className="secondary" disabled={busy || !info?.orderEnabled} onClick={() => void run(async () => { await api(`/parties/${selected.id}/store-connection`, { method: 'POST', version: selected.version, body: { qrToken: token } }); onParty(selected.id) })}>{selected.title} 파티에 연결</button>}
  </Entry>
}
