import { useCallback, useEffect, useRef, useState } from 'react'
import { api, allPages, ApiError, subscribe } from '../lib/api'
import type { Menu, Order, Party, User, OptionSelection } from '../types/api'
import { Header } from '../App'
import DietaryRestrictions from './DietaryRestrictions'

export default function OrderPage({ id, user, isHost: initialHost, onHome }: { id: string; user: User; isHost?: boolean; onHome: () => void }) {
  const [order, setOrder] = useState<Order | null>(null), [menus, setMenus] = useState<Menu[]>([]), [isHost, setHost] = useState(initialHost || false)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [connected, setConnected] = useState(false), [editRestrictions, setEditRestrictions] = useState(false)
  const sequence = useRef(0), terminal = useRef(false), lock = useRef(false), active = useRef(true)
  const base = `/orders/${id}`
  const load = useCallback(async () => {
    if (terminal.current) return
    const request = ++sequence.current
    try {
      const o = await api<Order>(base)
      const list = o.status === 'DRAFT' ? await allPages<Menu>(`${base}/menus`) : []
      if (request !== sequence.current || !active.current || terminal.current) return
      setOrder(o); setMenus(list)
      if (o.partyId && initialHost === undefined) { const p = await api<Party>(`/parties/${o.partyId}`); setHost(p.hostMemberId === p.myMemberId) }
    } catch (e) { if (!terminal.current && active.current) setError((e as Error).message) }
  }, [base, initialHost])
  useEffect(() => {
    active.current = true; void load()
    const stop = subscribe(base, e => {
      const status = e.data?.status
      if (typeof status === 'string' && ['CONFIRMED', 'REJECTED', 'CANCELED'].includes(status)) {
        // Guests expire on completion. Preserve the final status event locally;
        // account users may also fetch rejection detail with their own token.
        if (user.principalType !== 'USER') { terminal.current = true; setOrder(o => o ? { ...o, status: status as Order['status'], rejection: e.data.rejection as Order['rejection'] || o.rejection } : o) }
        else void load()
      } else void load()
    }, () => void load(), setConnected)
    const focus = () => void load(); window.addEventListener('focus', focus)
    return () => { active.current = false; sequence.current++; stop(); window.removeEventListener('focus', focus) }
  }, [base, load, user.principalType])
  async function command(path: string, method = 'POST', body?: unknown) {
    if (!order || lock.current) return
    lock.current = true; setBusy(true); setError('')
    try { const next = await api<Order>(`${base}${path}`, { method, body, version: order.version }); setOrder(next); await load() }
    catch (e) { if (e instanceof ApiError && e.details.order) setOrder(e.details.order as Order); setError((e as Error).message); await load() }
    finally { lock.current = false; if (active.current) setBusy(false) }
  }
  if (editRestrictions) return <DietaryRestrictions onBack={() => { setEditRestrictions(false); void load() }} />
  if (!order) return <main className="onboarding flow-screen"><Header title="주문" onHome={onHome} /><p role="status">{error || '주문을 불러오는 중…'}</p><button className="secondary" onClick={() => void load()}>다시 불러오기</button></main>
  const me = order.members.find(m => m.memberId === order.myMemberId), completed = me?.selectionStatus === 'COMPLETED', editable = order.status === 'DRAFT' && !completed
  const title = ({ DRAFT: '각자 메뉴를 골라요', SUBMITTED: '식당 확인을 기다려요', CONFIRMED: '식당 주문 수락 완료', REJECTED: '식당이 주문을 거절했어요', CANCELED: '주문이 취소됐어요' })[order.status]
  return <main className="onboarding flow-screen"><Header title="우리의 한 끼" onHome={onHome} user={user} /><div className="stage-line"><span>{order.type === 'PARTY' ? '함께 주문' : '매장 QR 주문'}</span><small className={connected ? 'connection-on' : 'connection-off'}>{connected ? '실시간 연결됨' : '연결 복구 중'}</small></div><h1>{title}</h1>
    {error && <p className="error-box" role="alert">{error}</p>}
    <p className="muted">주문 수락은 결제 완료가 아니에요. 결제는 매장에서 진행해 주세요.</p>
    {order.status === 'REJECTED' && <p className="error-box" role="status">{order.rejection?.message || '매장에서 주문을 받을 수 없어요.'}</p>}
    {order.type === 'QR_GUEST' && order.status === 'DRAFT' && <button className="secondary" onClick={() => setEditRestrictions(true)}>내 식사 제한 확인·수정</button>}
    {order.status === 'DRAFT' && <><h2>판매 메뉴</h2>{menus.length === 0 && <p className="muted">선택 가능한 메뉴가 없어요. 매장에 문의해 주세요.</p>}<div className="stack">{menus.map(menu => <MenuPicker key={`${menu.id}:${menu.version}`} menu={menu} disabled={!editable || busy} onAdd={body => command('/my-items', 'POST', body)} />)}</div></>}
    <section className="summary-card"><h2>함께 담은 메뉴</h2>{order.members.map(m => <section key={m.memberId} className="order-member"><h3>{m.displayName}{m.memberId === me?.memberId && ' (나)'} <small>{m.selectionStatus === 'COMPLETED' ? '선택 완료' : '선택 중'}</small></h3>{m.items.length === 0 && <p className="muted">아직 담은 메뉴가 없어요.</p>}{m.items.map(item => <div className="order-line" key={item.id}><strong>{item.menuName} × {item.quantity}</strong><span>{item.lineAmount.toLocaleString()}원</span>{item.options.length > 0 && <small>{item.options.map(o => `${o.optionName}: ${o.valueName}`).join(', ')}</small>}{item.request && <small>요청: {item.request}</small>}{editable && m.memberId === me?.memberId && <div className="button-row"><button className="secondary compact" aria-label={`${item.menuName} 수량 줄이기`} disabled={busy || item.quantity <= 1} onClick={() => void command(`/my-items/${item.id}`, 'PATCH', { quantity: item.quantity - 1 })}>−</button><button className="secondary compact" aria-label={`${item.menuName} 수량 늘리기`} disabled={busy || item.quantity >= 99} onClick={() => void command(`/my-items/${item.id}`, 'PATCH', { quantity: item.quantity + 1 })}>＋</button><button className="text-button danger" disabled={busy} onClick={() => void command(`/my-items/${item.id}`, 'DELETE')}>삭제</button></div>}</div>)}</section>)}<div className="total-line"><span>합계</span><strong>{order.totalAmount.toLocaleString()}원</strong></div></section>
    {order.status === 'DRAFT' && <section className="stack"><button className="primary" disabled={busy || !completed && !me?.items.length} onClick={() => void command('/members/me/complete', completed ? 'DELETE' : 'POST')}>{completed ? '메뉴 선택 완료 취소' : '내 메뉴 선택 완료'}</button>{(isHost || order.type === 'QR_GUEST') && <button className="secondary" disabled={busy || order.members.some(m => m.selectionStatus !== 'COMPLETED')} onClick={() => void command('/submit')}>식당에 주문 제출</button>}<p className="muted">{order.members.filter(m => m.selectionStatus === 'COMPLETED').length}/{order.members.length}명 선택 완료 · 제출 후 수정할 수 없어요.</p></section>}
    {order.status !== 'DRAFT' && <button className="primary" onClick={onHome}>홈으로 돌아가기</button>}
  </main>
}
function MenuPicker({ menu, disabled, onAdd }: { menu: Menu; disabled: boolean; onAdd: (body: unknown) => Promise<void> }) {
  const [options, setOptions] = useState<OptionSelection[]>([]), [quantity, setQuantity] = useState(1), [request, setRequest] = useState('')
  const unitPrice = menu.price + options.reduce((sum, o) => sum + (menu.options.find(g => g.id === o.optionId)?.values.find(v => v.id === o.valueId)?.additionalPrice || 0), 0)
  return <form className="menu-picker summary-card" onSubmit={e => { e.preventDefault(); void onAdd({ menuId: menu.id, quantity, options, request }) }}><h3>{menu.name}</h3><p>{menu.description}</p><strong>{menu.price.toLocaleString()}원</strong>{menu.salesStatus === 'SOLD_OUT' && <span className="error-box">품절</span>}
    <details><summary>수량 · 옵션 · 요청사항</summary><label>수량<input type="number" min={1} max={99} value={quantity} onChange={e => setQuantity(Number(e.target.value))} disabled={disabled} required /></label>{menu.options.map(group => <fieldset key={group.id}><legend>{group.name} ({group.minSelections}~{group.maxSelections}개)</legend>{group.values.map(value => <label className="check-row" key={value.id}><input type="checkbox" disabled={disabled || value.salesStatus !== 'AVAILABLE'} checked={options.some(o => o.optionId === group.id && o.valueId === value.id)} onChange={e => setOptions(prev => e.target.checked ? [...(group.maxSelections === 1 ? prev.filter(o => o.optionId !== group.id) : prev), { optionId: group.id, valueId: value.id }] : prev.filter(o => o.optionId !== group.id || o.valueId !== value.id))} /><span>{value.name} (+{value.additionalPrice.toLocaleString()}원)</span></label>)}</fieldset>)}<label>요청사항<input maxLength={300} value={request} onChange={e => setRequest(e.target.value)} disabled={disabled} /></label></details>
    <button className="secondary" disabled={disabled || menu.salesStatus !== 'AVAILABLE'}>담기 · {(unitPrice * quantity).toLocaleString()}원</button></form>
}
