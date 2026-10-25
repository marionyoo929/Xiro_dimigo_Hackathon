import type { Page } from '@playwright/test'

// Exercise the SDK bridge without using a real key or external map traffic.
export async function mockKakao(page: Page) {
  await page.addInitScript(() => {
    type Coordinate = { getLat(): number; getLng(): number }
    const listeners = new WeakMap<object, Map<string, Set<(value?: unknown) => void>>>()
    const emit = (target: object, type: string, value?: unknown) => listeners.get(target)?.get(type)?.forEach(callback => callback(value))
    class LatLng { constructor(public lat: number, public lng: number) {} getLat() { return this.lat } getLng() { return this.lng } }
    class MapView {
      center: Coordinate
      constructor(public element: HTMLElement, options: { center: Coordinate }) {
        this.center = options.center
        element.style.background = '#f8efed'
        element.addEventListener('click', event => { if (event.target === element) emit(this, 'click', { latLng: new LatLng(37.5669, 126.9789) }) })
      }
      setBounds() {} setCenter(point: Coordinate) { this.center = point } getCenter() { return this.center } relayout() {} addControl() {}
    }
    class Marker {
      element: HTMLButtonElement; position: Coordinate
      constructor(options: { map: MapView; position: Coordinate; draggable?: boolean; title: string }) {
        this.position = options.position
        this.element = document.createElement('button'); this.element.type = 'button'; this.element.setAttribute('aria-label', '지도 핀')
        this.element.textContent = '📍'; Object.assign(this.element.style, { position: 'absolute', left: '45%', top: '40%', zIndex: '4' })
        this.element.addEventListener('click', event => event.stopPropagation())
        if (options.draggable) this.element.addEventListener('pointerdown', event => {
          event.stopPropagation(); this.element.setPointerCapture(event.pointerId)
          this.element.onpointerup = e => { this.position = new LatLng(37.5672, 126.9791); this.element.releasePointerCapture(e.pointerId); emit(this, 'dragend') }
        })
        options.map.element.appendChild(this.element)
      }
      getPosition() { return this.position } setMap(map: object | null) { if (!map) this.element.remove() }
    }
    class Overlay { setMap() {} getBounds() { return {} } }
    const maps = {
      load: (callback: () => void) => callback(), Map: MapView, LatLng, LatLngBounds: class { extend() {} }, Marker,
      Circle: Overlay, CustomOverlay: Overlay, MarkerImage: class {}, Size: class {}, Point: class {}, ZoomControl: class {}, ControlPosition: { RIGHT: 1 },
      event: { addListener(target: object, type: string, callback: (value?: unknown) => void) {
        if (!listeners.has(target)) listeners.set(target, new Map())
        const types = listeners.get(target)!; if (!types.has(type)) types.set(type, new Set()); types.get(type)!.add(callback)
      }, removeListener(target: object, type: string, callback: (value?: unknown) => void) { listeners.get(target)?.get(type)?.delete(callback) } },
      services: { Status: { OK: 'OK', ZERO_RESULT: 'ZERO_RESULT' }, SortBy: { DISTANCE: 'distance' }, Places: class {
        categorySearch(_code: string, callback: (items: never[], status: string) => void) { callback([], 'ZERO_RESULT') }
      }, Geocoder: class {
        coord2Address(_longitude: number, _latitude: number, callback: (items: object[], status: string) => void) { setTimeout(() => callback([{ road_address: { address_name: '서울 중구 세종대로 110' } }], 'OK'), 20) }
      } },
    }
    Object.assign(window, { kakao: { maps } })
  })
}
