import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

// Exercise the real adapter without making API calls or reading a real key.
const source = await readFile(new URL('../src/lib/kakaoMaps.ts', import.meta.url), 'utf8')
const javascript = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText.replace('import.meta.env.VITE_KAKAO_MAP_APP_KEY', '"test-javascript-key"')
const { searchPlaces, loadKakaoMaps } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`)
globalThis.window = { setTimeout, clearTimeout }
const pagination = { totalCount: 6, current: 2, last: 2, hasNextPage: false }
const place = {
  id: 'public-test-place', place_name: '약속 공원', road_address_name: '도로명 주소', address_name: '지번 주소',
  x: '126.8123', y: '37.3214', place_url: 'https://place.map.kakao.com/public-test-place', category_name: '여행 > 공원',
}
function sdkFor(status, results = [place]) {
  return { services: { Status: { OK: 'OK', ZERO_RESULT: 'ZERO_RESULT' }, Places: class {
    keywordSearch(query, callback, options) {
      assert.equal(query, '약속 공원')
      assert.deepEqual(options, { page: 2, size: 5 })
      callback(results, status, pagination)
    }
  } } }
}
const found = await searchPlaces(sdkFor('OK'), '약속 공원', 2)
assert.equal(found.places[0].latitude, 37.3214)
assert.equal(found.places[0].longitude, 126.8123)
assert.equal(found.places[0].address, '도로명 주소')
assert.equal(found.places[0].id, place.id)
assert.equal(found.pagination, pagination)
const fallback = await searchPlaces(sdkFor('OK', [{ ...place, road_address_name: '' }]), '약속 공원', 2)
assert.equal(fallback.places[0].address, '지번 주소')
assert.deepEqual(await searchPlaces(sdkFor('ZERO_RESULT', []), '약속 공원', 2), { places: [], pagination: null })
await assert.rejects(searchPlaces(sdkFor('ERROR'), '약속 공원', 2), /장소를 검색하지 못했어요/)
window.setTimeout = callback => setTimeout(callback, 1)
await assert.rejects(searchPlaces({ services: { Places: class { keywordSearch() {} } } }, '약속 공원', 2), /검색 응답이 늦어지고 있어요/)
window.setTimeout = setTimeout

// Concurrent React mounts share one SDK request; a failed load can be retried.
let appended = 0
globalThis.document = {
  getElementById: () => null,
  createElement: () => ({ remove() {} }),
  head: { appendChild(script) { appended++; queueMicrotask(() => script.onerror()) } },
}
const firstLoad = loadKakaoMaps()
const concurrentLoad = loadKakaoMaps()
assert.equal(firstLoad, concurrentLoad)
await assert.rejects(firstLoad, /지도를 불러오지 못했어요/)
await assert.rejects(loadKakaoMaps(), /지도를 불러오지 못했어요/)
assert.equal(appended, 2)
console.log('PASS: coordinates, address fallback, pagination, empty/error/timeout responses, SDK concurrency and retry')
