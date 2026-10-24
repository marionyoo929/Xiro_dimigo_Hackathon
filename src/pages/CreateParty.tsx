import { useEffect, useRef, useState } from 'react'
import PlaceMap from '../components/PlaceMap'
import { searchPlaces, type MapsSDK, type PlaceLocation, type SearchPagination } from '../lib/kakaoMaps'
import type { Party, PartySettings } from '../data/sampleParty'
import { registeredCatalog } from '../data/registeredCatalog'
import { formatRadius, normalizeRadiusMeters, nearbyRegisteredRestaurants, MIN_RADIUS_METERS, MAX_RADIUS_METERS, RADIUS_STEP_METERS } from '../lib/registeredCatalog'
import '../styles/place-picker.css'

const asset = (name: string) => `${import.meta.env.BASE_URL}images/${encodeURIComponent(name)}`
const noResults: PlaceLocation[] = []
export default function CreateParty({ initialParty, nickname, onNext, onBack, onHome }: {
  initialParty: Party | null; nickname: string; onNext: (settings: PartySettings) => void; onBack: () => void; onHome: () => void
}) {
  const [sdk, setSDK] = useState<MapsSDK | null>(null)
  const [query, setQuery] = useState('')
  const [searchedQuery, setSearchedQuery] = useState('')
  const [places, setPlaces] = useState<PlaceLocation[]>([])
  const [pagination, setPagination] = useState<SearchPagination | null>(null)
  const [selected, setSelected] = useState<PlaceLocation | null>(initialParty?.location || null)
  const [radiusMeters, setRadiusMeters] = useState(() => normalizeRadiusMeters((initialParty?.location ? initialParty.radiusKm : 1) * 1000))
  const radiusKm = radiusMeters / 1000
  const [budgetMax, setBudgetMax] = useState(initialParty?.budgetMax || 25000)
  const [partyName, setPartyName] = useState(initialParty?.location ? initialParty.name : '')
  const [searching, setSearching] = useState(false)
  const [searchNotice, setSearchNotice] = useState('')
  const [showResults, setShowResults] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const requestId = useRef(0)
  const searchInput = useRef<HTMLInputElement>(null)
  const profile = useRef<HTMLDialogElement>(null)
  useEffect(() => () => { requestId.current++ }, [])
  useEffect(() => { if (profileOpen) profile.current?.showModal() }, [profileOpen])

  async function search(keyword: string, page = 1) {
    if (!sdk) return
    const trimmed = keyword.trim()
    const current = ++requestId.current
    if (!trimmed) { setSearching(false); setPlaces([]); setPagination(null); searchInput.current?.focus(); setSearchNotice('장소 이름이나 주소를 입력해 주세요.'); setShowResults(true); return }
    setSearching(true); setSearchNotice(''); setShowResults(true)
    setPlaces([]); setPagination(null); setSearchedQuery(trimmed)
    try {
      const result = await searchPlaces(sdk, trimmed, page)
      if (requestId.current !== current) return
      setPlaces(result.places); setPagination(result.pagination)
      if (!result.places.length) setSearchNotice('검색 결과가 없어요. 지역명과 장소명을 함께 입력해 보세요.')
    } catch (reason) {
      if (requestId.current === current) setSearchNotice(reason instanceof Error ? reason.message : '검색하지 못했어요.')
    } finally { if (requestId.current === current) setSearching(false) }
  }
  function choose(place: PlaceLocation) {
    setSelected(place); setShowResults(false); searchInput.current?.blur()
  }
  const restaurantCount = selected ? nearbyRegisteredRestaurants(registeredCatalog, { location: selected, searchRadiusMeters: radiusMeters }).length : 0
  const radiusProgress = (radiusMeters - MIN_RADIUS_METERS) / (MAX_RADIUS_METERS - MIN_RADIUS_METERS) * 100
  return <main className="onboarding place-screen">
    <h1 className="sr-only">약속 장소 정하기</h1>
    <header className="place-header">
      <div className="place-header-row">
        <button className="place-back" aria-label={initialParty ? '대기실로 돌아가기' : '홈으로 돌아가기'} onClick={onBack}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 4-8 8 8 8" /></svg></button>
        <span className="preferences-logo"><img src={asset('logo.png')} alt="시로 XIRO" /></span><span className="place-header-spacer" />
      </div>
      <form className="place-search" role="search" onSubmit={event => { event.preventDefault(); void search(query) }}>
        <button type="submit" aria-label="장소 검색" disabled={!sdk || searching}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6.5" /><path d="m15 15 5 5" /></svg></button>
        <input ref={searchInput} aria-label="장소나 주소 검색" placeholder="장소나 주소 검색" maxLength={100} value={query} onChange={event => setQuery(event.target.value)} onFocus={() => { if (searchedQuery) setShowResults(true) }} />
        {query && <button type="button" aria-label="검색어 지우기" onClick={() => { setQuery(''); searchInput.current?.focus() }}>×</button>}
      </form>
    </header>
    <section className="place-map-area" aria-label="지도에서 장소 확인">
      <PlaceMap places={showResults ? places : noResults} selected={selected} radiusKm={radiusKm} onSelect={choose} onReady={setSDK} />
      {showResults && <section className="place-results" aria-label="장소 검색 결과" aria-busy={searching}>
        <div className="results-heading"><strong>{searching ? '검색 중…' : '검색 결과'}</strong><button type="button" aria-label="검색 결과 닫기" onClick={() => setShowResults(false)}>×</button></div>
        <p className="search-notice" role="status">{searchNotice || (!searching && places.length ? `${searchedQuery} 검색 결과예요. 장소를 선택해 주세요.` : '')}</p>
        <ul>{places.map(place => <li key={place.id}><button type="button" aria-pressed={selected?.id === place.id} onClick={() => choose(place)}><strong>{place.name}</strong><span>{place.address}</span><small>{place.category.split(' > ').slice(-2).join(' · ')}</small></button></li>)}</ul>
        {pagination && (pagination.current > 1 || pagination.hasNextPage) && <nav className="search-pages" aria-label="검색 결과 페이지">
          <button type="button" disabled={searching || pagination.current <= 1} onClick={() => void search(searchedQuery, pagination.current - 1)}>이전</button><span>{pagination.current} / {pagination.last}</span>
          <button type="button" disabled={searching || !pagination.hasNextPage} onClick={() => void search(searchedQuery, pagination.current + 1)}>다음</button>
        </nav>}
      </section>}
    </section>
    <section className="place-sheet" aria-label="선택한 모임 장소와 조건">
      <div className="sheet-handle" aria-hidden="true" />
      <div className="selected-place-heading"><h2>{selected?.name || '어디에서 만날까요?'}</h2>{selected?.category && <span>{selected.category.split(' > ').at(-1)}</span>}</div>
      <button className="selected-address" onClick={() => { setShowResults(Boolean(searchedQuery)); searchInput.current?.focus() }}>{selected?.address || '위 검색창에서 모일 장소를 찾아주세요.'} <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 13-1 4 4-1L17 6l-3-3Z" /></svg></button>
      <div className="radius-heading"><label id="radius-label" htmlFor="search-radius">검색 반경 <output htmlFor="search-radius">{formatRadius(radiusMeters)}</output></label><span className="restaurant-count" role="status" title="시로에 등록된 식당 중 선택한 반경 안의 식당 수입니다.">{selected ? `주변 등록 식당 ${restaurantCount.toLocaleString()}곳` : '등록 식당 기준'}</span></div>
      <div className="radius-slider"><input id="search-radius" type="range" aria-labelledby="radius-label" aria-valuetext={formatRadius(radiusMeters)} min={MIN_RADIUS_METERS} max={MAX_RADIUS_METERS} step={RADIUS_STEP_METERS} value={radiusMeters} onChange={event => setRadiusMeters(normalizeRadiusMeters(Number(event.target.value)))} style={{ background: `linear-gradient(to right, #eaa0a4 ${radiusProgress}%, #f5e6e6 ${radiusProgress}%)` }} /><div className="radius-limits" aria-hidden="true"><span>200m</span><span>1km</span></div></div>
      <p className="catalog-demo-note">시연용 등록 식당·메뉴 기준</p>
      <details className="meeting-conditions"><summary><span className="conditions-icon" aria-hidden="true">☷</span><span><strong>모임 조건</strong><small>1인 {budgetMax.toLocaleString()}원 이하 · 조건 변경</small></span><span className="conditions-arrow" aria-hidden="true">›</span></summary>
        <div className="conditions-fields"><label>파티 이름<input maxLength={40} placeholder={selected ? `${selected.name} 모임` : '파티 이름'} value={partyName} onChange={event => setPartyName(event.target.value)} /></label><label>1인 예산<select value={budgetMax} onChange={event => setBudgetMax(Number(event.target.value))}>{[10000, 15000, 20000, 25000, 30000, 50000].map(amount => <option key={amount} value={amount}>{amount.toLocaleString()}원 이하</option>)}</select></label></div>
      </details>
      {!selected && <p className="place-helper">장소를 선택하면 가운데 + 버튼으로 파티를 만들 수 있어요.</p>}
    </section>
    <nav className="place-bottom-nav" aria-label="주 메뉴">
      <button type="button" aria-label="내 프로필" onClick={() => setProfileOpen(true)}><svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="13" fill="currentColor" /><circle cx="16" cy="11" r="4.5" fill="#eaa4a3" /><path d="M7 25c0-9 18-9 18 0" fill="#eaa4a3" /></svg></button>
      <button type="button" className="place-create" aria-label={initialParty ? '변경 내용 저장' : '이 장소로 파티 만들기'} disabled={!selected || !sdk} onClick={() => { if (selected) onNext({ location: selected, radiusKm, budgetMax, name: partyName.trim() || `${selected.name} 모임` }) }}><span aria-hidden="true">+</span><small>{initialParty ? '저장하기' : '파티 만들기'}</small></button>
      <button type="button" aria-label="홈으로 이동" onClick={onHome}><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M3 14 16 3l13 11v15H19v-9h-6v9H3Z" fill="currentColor" /></svg></button>
    </nav>
    {profileOpen && <dialog ref={profile} className="place-profile" onClose={() => setProfileOpen(false)}><h2>내 프로필</h2><p>{nickname}님으로 참여하고 있어요.</p><button type="button" onClick={() => profile.current?.close()}>닫기</button></dialog>}
  </main>
}
