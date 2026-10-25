import { useState } from 'react'
import { Header } from '../App'
import { api } from '../lib/api'
import type { CustomerProfile as Profile, ProfileResponse } from '../types/customerStats'

export default function CustomerProfile({ initial, onSaved, onBack }: { initial: Profile | null; onSaved: (profile: Profile) => void; onBack: () => void }) {
  const [age, setAge] = useState(initial ? String(initial.age) : ''), [gender, setGender] = useState<Profile['gender'] | ''>(initial?.gender || '')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  return <main className="onboarding flow-screen profile-screen"><Header title="내 기본 정보" />
    <img className="entry-mascot" src="/images/mascot.png" alt="" />
    <h1>{initial ? '기본 정보를 수정해요' : '시작하기 전에 알려주세요'}</h1>
    <p className="muted">연령과 성별은 매장 고객 통계에 사용해요. 사장님에게는 연령대·성별별 합계만 표시돼요.</p>
    {error && <p className="error-box" role="alert">{error}</p>}
    <form className="stack" onSubmit={e => {
      e.preventDefault(); if (busy) return; setBusy(true); setError('')
      void api<ProfileResponse>('/me/profile', { method: 'PUT', body: { age: Number(age), gender } }).then(result => {
        if (!result.profile) throw new Error('저장된 기본 정보를 확인하지 못했어요.')
        onSaved(result.profile)
      }).catch(e => setError(e instanceof Error ? e.message : '저장하지 못했어요. 다시 시도해 주세요.')).finally(() => setBusy(false))
    }}>
      <label>나이 (만 나이)<input type="number" inputMode="numeric" min={1} max={120} step={1} required value={age} disabled={busy} onChange={e => setAge(e.target.value)} placeholder="예: 18" /></label>
      <label>성별<select aria-label="성별" required value={gender} disabled={busy} onChange={e => setGender(e.target.value as Profile['gender'])}><option value="" disabled>성별을 선택해 주세요</option><option value="FEMALE">여성</option><option value="MALE">남성</option><option value="OTHER">기타</option><option value="UNDISCLOSED">응답 안 함</option></select></label>
      <button className="primary" disabled={busy || !age || !gender}>{busy ? '저장 중…' : initial ? '기본 정보 저장' : '저장하고 계속하기'}</button>
      <button type="button" className="text-button" disabled={busy} onClick={onBack}>{initial ? '취소' : '로그아웃하고 돌아가기'}</button>
    </form>
  </main>
}
