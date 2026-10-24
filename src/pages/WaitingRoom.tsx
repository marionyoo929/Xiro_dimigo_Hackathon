import type { PageProps } from '../types'
import type { Party } from '../data/sampleParty'

export default function WaitingRoom({ party, onNext }: PageProps & { party: Party }) {
  return <>
    <h1>{party.name}</h1>
    <p>{party.place} · 반경 {party.radiusKm}km · {party.budgetMax.toLocaleString()}원 이하</p>
    <p>파티 대기실</p>
    <button type="button" onClick={onNext}>메뉴 소거 시작</button>
  </>
}
