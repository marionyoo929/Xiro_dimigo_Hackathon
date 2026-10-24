import { sampleParty } from '../data/sampleParty'
import type { PageProps } from '../types'

export default function CreateParty({ onNext }: PageProps) {
  return <>
    <h1>파티 생성</h1>
    <p>모임 장소: {sampleParty.place}</p>
    <p>탐색 반경: {sampleParty.radiusKm}km · 1인 예산: {sampleParty.budgetMax.toLocaleString()}원 이하</p>
    <button type="button" onClick={onNext}>이 조건으로 파티 만들기</button>
  </>
}
