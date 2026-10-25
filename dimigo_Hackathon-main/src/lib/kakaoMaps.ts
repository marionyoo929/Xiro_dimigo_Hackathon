export interface PlaceLocation {
  id: string; name: string; address: string; latitude: number; longitude: number; url: string; category: string
}
interface SearchPlace {
  id: string; place_name: string; address_name: string; road_address_name: string
  x: string; y: string; place_url: string; category_name: string
}
export interface SearchPagination { totalCount: number; current: number; last: number; hasNextPage: boolean }
type SearchCallback = (places: SearchPlace[], status: string, pagination: SearchPagination) => void
interface PlaceService {
  keywordSearch(query: string, callback: SearchCallback, options: { page: number; size: number }): void
  categorySearch(code: string, callback: SearchCallback, options: { location: LatLng; radius: number; sort: string; size: number }): void
}
export interface LatLng { getLat(): number; getLng(): number }
export interface MapMouseEvent { latLng: LatLng }
interface Bounds { extend(position: LatLng): void }
export interface MapInstance {
  setBounds(bounds: Bounds, top?: number, right?: number, bottom?: number, left?: number): void
  setCenter(position: LatLng): void
  getCenter(): LatLng
  relayout(): void
  addControl(control: object, position: number): void
}
interface Overlay { setMap(map: MapInstance | null): void }
export interface MapsSDK {
  load(callback: () => void): void
  LatLng: new (latitude: number, longitude: number) => LatLng
  LatLngBounds: new () => Bounds
  Map: new (container: HTMLElement, options: { center: LatLng; level: number }) => MapInstance
  Marker: new (options: { map: MapInstance; position: LatLng; title: string; draggable?: boolean; image?: object; zIndex?: number }) => Overlay & { getPosition(): LatLng }
  MarkerImage: new (src: string, size: object, options?: { offset: object }) => object
  Size: new (width: number, height: number) => object
  Point: new (x: number, y: number) => object
  CustomOverlay: new (options: { map: MapInstance; position: LatLng; content: HTMLElement; yAnchor: number; zIndex: number }) => Overlay
  Circle: new (options: {
    map: MapInstance; center: LatLng; radius: number; strokeWeight: number; strokeColor: string
    strokeOpacity: number; strokeStyle: string; fillColor: string; fillOpacity: number
  }) => Overlay & { getBounds(): Bounds }
  ZoomControl: new () => object
  ControlPosition: { RIGHT: number }
  event: { addListener(target: object, type: string, callback: (event: MapMouseEvent) => void): void; removeListener(target: object, type: string, callback: (event: MapMouseEvent) => void): void }
  services: {
    Places: new () => PlaceService
    Geocoder: new () => { coord2Address(longitude: number, latitude: number, callback: (result: { road_address?: { address_name: string } | null; address?: { address_name: string } | null }[], status: string) => void): void }
    Status: { OK: string; ZERO_RESULT: string }; SortBy: { DISTANCE: string }
  }
}
declare global { interface Window { kakao?: { maps: MapsSDK } } }
let pendingSDK: Promise<MapsSDK> | null = null

export function loadKakaoMaps(): Promise<MapsSDK> {
  if (window.kakao?.maps?.services) return Promise.resolve(window.kakao.maps)
  if (pendingSDK) return pendingSDK
  const key = import.meta.env.VITE_KAKAO_MAP_APP_KEY?.trim()
  if (!key) return Promise.reject(new Error('카카오 지도 JavaScript 키가 설정되지 않았어요. 지도 설정 후 다시 시도해 주세요.'))
  pendingSDK = new Promise<MapsSDK>((resolve, reject) => {
    document.getElementById('kakao-map-sdk')?.remove()
    const script = document.createElement('script')
    script.id = 'kakao-map-sdk'
    script.async = true
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false&libraries=services`
    const fail = () => {
      window.clearTimeout(timeout)
      script.remove()
      reject(new Error('지도를 불러오지 못했어요. 지도 키·허용된 사이트 주소·인터넷 연결을 확인해 주세요.'))
    }
    const timeout = window.setTimeout(fail, 15000)
    script.onerror = fail
    script.onload = () => {
      try {
        if (!window.kakao?.maps) { fail(); return }
        window.kakao.maps.load(() => {
          if (!window.kakao?.maps.services) { fail(); return }
          window.clearTimeout(timeout)
          resolve(window.kakao.maps)
        })
      } catch { fail() }
    }
    document.head.appendChild(script)
  }).catch(error => { pendingSDK = null; throw error })
  return pendingSDK
}

export function searchPlaces(sdk: MapsSDK, query: string, page: number) {
  return new Promise<{ places: PlaceLocation[]; pagination: SearchPagination | null }>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('검색 응답이 늦어지고 있어요. 다시 검색해 주세요.')), 10000)
    new sdk.services.Places().keywordSearch(query, (data, status, pagination) => {
      window.clearTimeout(timeout)
      if (status === sdk.services.Status.ZERO_RESULT) resolve({ places: [], pagination: null })
      else if (status === sdk.services.Status.OK) resolve({
        places: data.map(place => ({
          id: place.id, name: place.place_name, address: place.road_address_name || place.address_name,
          latitude: Number(place.y), longitude: Number(place.x), url: place.place_url, category: place.category_name,
        })), pagination,
      })
      else reject(new Error('장소를 검색하지 못했어요. 잠시 후 다시 시도해 주세요.'))
    }, { page, size: 5 })
  })
}

export function searchNearbyStation(sdk: MapsSDK, place: PlaceLocation): Promise<PlaceLocation | null> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('주변 역 검색 시간이 초과됐어요.')), 8000)
    new sdk.services.Places().categorySearch('SW8', (data, status) => {
      window.clearTimeout(timeout)
      if (status === sdk.services.Status.ZERO_RESULT) { resolve(null); return }
      if (status !== sdk.services.Status.OK) { reject(new Error('주변 역을 검색하지 못했어요.')); return }
      const station = data.find(item => Number.isFinite(Number(item.y)) && Number.isFinite(Number(item.x)))
      resolve(station ? {
        id: station.id, name: station.place_name, address: station.road_address_name || station.address_name,
        latitude: Number(station.y), longitude: Number(station.x), url: station.place_url, category: station.category_name,
      } : null)
    }, { location: new sdk.LatLng(place.latitude, place.longitude), radius: 1500, sort: sdk.services.SortBy.DISTANCE, size: 5 })
  })
}

export function addressAtPoint(sdk: MapsSDK, latitude: number, longitude: number): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('주소 확인이 늦어지고 있어요. 상세 위치를 입력해 주세요.')), 8000)
    new sdk.services.Geocoder().coord2Address(longitude, latitude, (result, status) => {
      clearTimeout(timeout)
      if (status === sdk.services.Status.ZERO_RESULT) { resolve(null); return }
      if (status !== sdk.services.Status.OK) { reject(new Error('주소를 확인하지 못했어요. 상세 위치를 입력해 주세요.')); return }
      resolve(result[0]?.road_address?.address_name || result[0]?.address?.address_name || null)
    })
  })
}
