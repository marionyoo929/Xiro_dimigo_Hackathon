import { useEffect, useRef, useState } from 'react'
import { loadKakaoMaps, type MapInstance, type MapsSDK, type PlaceLocation } from '../lib/kakaoMaps'
import { formatRadius } from '../lib/registeredCatalog'

const noPlaces: PlaceLocation[] = []
export default function PlaceMap({ places = noPlaces, selected, radiusKm, onSelect, onReady }: {
  places?: PlaceLocation[]; selected: PlaceLocation | null; radiusKm: number
  onSelect?: (place: PlaceLocation) => void; onReady?: (sdk: MapsSDK | null) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapInstance | null>(null)
  const [sdk, setSDK] = useState<MapsSDK | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const selectRef = useRef(onSelect)
  const lastView = useRef<{ placeId: string | null; hadResults: boolean }>({ placeId: null, hadResults: false })
  const fitSelection = useRef<(() => void) | null>(null)
  selectRef.current = onSelect
  useEffect(() => {
    let active = true
    let observer: ResizeObserver | undefined
    setError('')
    onReady?.(null)
    loadKakaoMaps().then(api => {
      if (!active || !container.current) return
      const instance = new api.Map(container.current, { center: new api.LatLng(37.566826, 126.9786567), level: 5 })
      instance.addControl(new api.ZoomControl(), api.ControlPosition.RIGHT)
      map.current = instance
      lastView.current = { placeId: null, hadResults: false }
      observer = new ResizeObserver(() => { const center = instance.getCenter(); instance.relayout(); instance.setCenter(center) })
      observer.observe(container.current)
      setSDK(api)
      onReady?.(api)
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : '지도를 불러오지 못했어요.') })
    return () => { active = false; observer?.disconnect(); map.current = null }
  }, [attempt, onReady])

  useEffect(() => {
    if (!sdk || !map.current) return
    const instance = map.current
    const overlays: { setMap(map: MapInstance | null): void }[] = []
    const listeners: { marker: object; callback: () => void }[] = []
    const bounds = new sdk.LatLngBounds()
    for (const place of places) {
      if (selected?.id === place.id) continue
      const position = new sdk.LatLng(place.latitude, place.longitude)
      const marker = new sdk.Marker({ map: instance, position, title: place.name })
      overlays.push(marker)
      bounds.extend(position)
      const callback = () => selectRef.current?.(place)
      sdk.event.addListener(marker, 'click', callback)
      listeners.push({ marker, callback })
    }
    if (selected) {
      const position = new sdk.LatLng(selected.latitude, selected.longitude)
      const circle = new sdk.Circle({
        map: instance, center: position, radius: radiusKm * 1000,
        strokeWeight: 2, strokeColor: '#ee9397', strokeOpacity: 0.95, strokeStyle: 'shortdash',
        fillColor: '#eea2a5', fillOpacity: 0.18,
      })
      const pin = document.createElement('div')
      pin.className = 'meeting-map-pin'
      pin.setAttribute('role', 'img')
      pin.setAttribute('aria-label', `${selected.name}, 모임 중심 장소`)
      overlays.push(circle, new sdk.CustomOverlay({ map: instance, position, content: pin, yAnchor: 1, zIndex: 3 }))
      fitSelection.current = () => instance.setBounds(circle.getBounds(), 24, 24, 24, 24)
      // Keep zoom fixed when only the radius changes so the circle visibly grows.
      if (!places.length && (lastView.current.placeId !== selected.id || lastView.current.hadResults)) fitSelection.current()
    }
    if (places.length) {
      // Include the selected result too when it is part of the current search.
      if (selected && places.some(place => place.id === selected.id)) bounds.extend(new sdk.LatLng(selected.latitude, selected.longitude))
      instance.setBounds(bounds, 40, 40, 40, 40)
    }
    lastView.current = { placeId: selected?.id || null, hadResults: places.length > 0 }
    return () => {
      fitSelection.current = null
      listeners.forEach(({ marker, callback }) => sdk.event.removeListener(marker, 'click', callback))
      overlays.forEach(overlay => overlay.setMap(null))
    }
  }, [sdk, places, selected, radiusKm])

  return <div className="place-map-frame">
    <div ref={container} className="place-map" aria-label={selected ? `${selected.name} 중심 반경 ${formatRadius(radiusKm * 1000)} 지도` : '모임 장소 검색 지도'} />
    {sdk && selected && <button className="map-fit-control" type="button" onClick={() => fitSelection.current?.()}>반경 전체 보기</button>}
    {!sdk && <div className="map-message" role={error ? 'alert' : 'status'}>
      <span className="map-message-symbol" aria-hidden="true">⌖</span>
      <p>{error || '지도를 불러오고 있어요…'}</p>
      {error && <button type="button" onClick={() => setAttempt(value => value + 1)}>다시 시도</button>}
    </div>}
  </div>
}
