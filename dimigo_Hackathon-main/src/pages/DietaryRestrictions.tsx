import { useEffect, useState } from 'react'
import { api, allPages } from '../lib/api'
import type { RestrictionCollection, RestrictionTarget } from '../types/api'

export default function DietaryRestrictions({ onBack, onSaved }: { onBack: () => void; onSaved?: () => void }) {
  const [collection, setCollection] = useState<RestrictionCollection | null>(null), [targets, setTargets] = useState<RestrictionTarget[]>([])
  const [selected, setSelected] = useState<string[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('')
  useEffect(() => { void Promise.all([api<RestrictionCollection>('/me/dietary-restrictions'), allPages<RestrictionTarget>('/restriction-targets')]).then(([c, t]) => { setCollection(c); setTargets(t); setSelected(c.items.map(i => i.targetCode)) }).catch(e => setError(e.message)) }, [])
  return <main className="onboarding flow-screen"><header className="flow-header"><button className="text-button" onClick={onBack}>〈 돌아가기</button><strong>내 식사 제한</strong></header><h1>먹을 수 없는 재료가 있나요?</h1><p className="muted">내 제한 상세는 다른 참가자에게 공개되지 않아요. 등록 정보로 필터링하며 실제 조리 환경의 안전을 보증하지 않아요.</p>
    {error && <p className="error-box" role="alert">{error}</p>}
    <form className="stack" onSubmit={e => { e.preventDefault(); if (!collection || busy) return; setBusy(true); setError(''); void api<RestrictionCollection>('/me/dietary-restrictions', { method: 'PUT', version: collection.revision, body: { items: targets.filter(t => selected.includes(t.code)).map(t => ({ type: t.type, targetCode: t.code, label: t.label, severity: 'HARD_BLOCK' })) } }).then(c => { setCollection(c); setNotice('저장했어요. 대기실에서 최신 제한을 다시 확인해 주세요.'); onSaved?.() }).catch(e => { setError(e.message); void api<RestrictionCollection>('/me/dietary-restrictions').then(setCollection) }).finally(() => setBusy(false)) }}>
      {targets.map(t => <label className="check-row" key={t.code}><input type="checkbox" checked={selected.includes(t.code)} onChange={e => setSelected(s => e.target.checked ? [...s, t.code] : s.filter(c => c !== t.code))} /><span>{t.label}</span><small>{({ ALLERGY: '알레르기', RELIGIOUS: '종교', VEGETARIAN: '채식', INGREDIENT_AVOIDANCE: '재료 제한', MEDICAL: '의학적 제한', OTHER: '기타' })[t.type]}</small></label>)}
      <button className="primary" disabled={!collection || busy}>{busy ? '저장 중…' : '식사 제한 저장'}</button><p role="status">{notice}</p>
    </form></main>
}
