import type { PageProps } from '../types'
import { partyFoods, type Party } from '../data/sampleParty'
import { formatRadius } from '../lib/registeredCatalog'
import PlaceMap from '../components/PlaceMap'

export default function WaitingRoom({ party, onNext, onEdit }: PageProps & { party: Party; onEdit: () => void }) {
  return <>
    <h1>{party.name}</h1>
    <p>{party.place} · 반경 {formatRadius(party.radiusKm * 1000)} · {party.budgetMax.toLocaleString()}원 이하</p>
    {party.location && <>
      <div className="waiting-place-map"><PlaceMap selected={party.location} radiusKm={party.radiusKm} /></div>
      <p className="waiting-address">{party.location.address}<br /><a className="waiting-place-link" href={`https://map.kakao.com/link/map/${encodeURIComponent(party.location.id)}`} target="_blank" rel="noreferrer">카카오맵에서 보기 ↗</a></p>
    </>}
    <p>파티 대기실</p>
    <button type="button" onClick={onEdit}>장소·조건 변경</button>
    <p className="demo-data-notice">선택한 반경 안의 등록 식당에서 판매 중인 메뉴만 후보로 표시해요.</p>
    {partyFoods(party).length === 0 && <p className="demo-data-notice" role="status">반경과 예산에 맞는 등록 메뉴가 없어요. 장소·조건을 변경해 주세요.</p>}
    <button type="button" onClick={onNext} disabled={partyFoods(party).length === 0}>메뉴 소거 시작</button>
  </>
}
