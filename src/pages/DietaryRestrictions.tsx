import { useEffect, useState } from 'react'
import { api, allPages } from '../lib/api'
import type { RestrictionCollection, RestrictionTarget } from '../types/api'

type Reason = RestrictionTarget['type']
const reasons: { type: Reason; label: string }[] = [
  { type: 'ALLERGY', label: '알레르기' }, { type: 'RELIGIOUS', label: '종교' },
  { type: 'VEGETARIAN', label: '채식' }, { type: 'INGREDIENT_AVOIDANCE', label: '재료 제한' },
  { type: 'MEDICAL', label: '의학적 제한' }, { type: 'OTHER', label: '기타' },
]
const categories = [
  { title: '견과류·콩류', codes: ['PEANUT', 'SOY'] },
  { title: '유제품·난류', codes: ['MILK', 'EGG'] },
  { title: '곡류', codes: ['WHEAT'] },
  { title: '생선·해산물', codes: ['FISH', 'SHELLFISH'] },
  { title: '육류', codes: ['PORK', 'BEEF', 'MEAT', 'ANIMAL_PRODUCT'] },
]
const defaultReason = (target: RestrictionTarget): Reason =>
  target.type === 'RELIGIOUS' || target.type === 'VEGETARIAN' ? 'INGREDIENT_AVOIDANCE' : target.type

export default function DietaryRestrictions({ onBack, onSaved }: { onBack: () => void; onSaved?: () => void }) {
  const [collection, setCollection] = useState<RestrictionCollection | null>(null), [targets, setTargets] = useState<RestrictionTarget[]>([])
  const [selected, setSelected] = useState<string[]>([]), [selectedReasons, setSelectedReasons] = useState<Record<string, Reason>>({})
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('')
  useEffect(() => { void Promise.all([api<RestrictionCollection>('/me/dietary-restrictions'), allPages<RestrictionTarget>('/restriction-targets')]).then(([c, t]) => {
    setCollection(c); setTargets(t); setSelected(c.items.map(item => item.targetCode))
    setSelectedReasons(Object.fromEntries(c.items.map(item => [item.targetCode, item.type])))
  }).catch(e => setError(e.message)) }, [])
  const categorized = categories.map(group => ({ title: group.title, items: targets.filter(target => group.codes.includes(target.code)) }))
  const knownCodes = new Set(categories.flatMap(group => group.codes))
  const others = targets.filter(target => !knownCodes.has(target.code))
  if (others.length) categorized.push({ title: '기타 재료', items: others })

  return <main className="onboarding flow-screen dietary-screen"><header className="flow-header"><button className="text-button" onClick={onBack}>〈 돌아가기</button><strong>내 식사 제한</strong></header>
    <section className="dietary-intro"><h1>먹을 수 없는 재료가 있나요?</h1><p className="muted">내 제한 상세는 다른 참가자에게 공개되지 않아요.<br />등록 정보로 필터링하며,<br />실제 조리 환경의 안전을 보장하지 않아요.</p></section>
    {error && <p className="error-box" role="alert">{error}</p>}
    <form className="stack dietary-form" onSubmit={event => {
      event.preventDefault(); if (!collection || busy) return
      setBusy(true); setError('')
      void api<RestrictionCollection>('/me/dietary-restrictions', { method: 'PUT', version: collection.revision, body: {
        items: targets.filter(target => selected.includes(target.code)).map(target => ({ type: selectedReasons[target.code] || defaultReason(target), targetCode: target.code, label: target.label, severity: 'HARD_BLOCK' })),
      } }).then(value => { setCollection(value); setNotice('저장했어요. 대기실에서 최신 제한을 다시 확인해 주세요.'); onSaved?.() })
        .catch(reason => { setError(reason.message); void api<RestrictionCollection>('/me/dietary-restrictions').then(setCollection) })
        .finally(() => setBusy(false))
    }}>
      {categorized.filter(group => group.items.length).map(group => <section className="dietary-group" key={group.title}><h2>{group.title}</h2><div className="dietary-items">{group.items.map(target => <div className="restriction-row" key={target.code}>
        <label className="restriction-choice"><input type="checkbox" checked={selected.includes(target.code)} onChange={event => setSelected(values => event.target.checked ? [...values, target.code] : values.filter(code => code !== target.code))} /><span>{target.label}</span></label>
        <select aria-label={`${target.label} 제한 사유`} disabled={!selected.includes(target.code)} value={selectedReasons[target.code] || defaultReason(target)} onChange={event => setSelectedReasons(values => ({ ...values, [target.code]: event.target.value as Reason }))}>{reasons.map(reason => <option key={reason.type} value={reason.type}>{reason.label}</option>)}</select>
      </div>)}</div></section>)}
      <button className="primary" disabled={!collection || busy}>{busy ? '저장 중…' : '식사 제한 저장'}</button><p role="status">{notice}</p>
    </form>
  </main>
}
