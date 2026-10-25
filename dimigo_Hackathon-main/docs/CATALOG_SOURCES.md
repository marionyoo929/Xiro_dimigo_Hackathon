# 안산 중앙역 등록 자료

확인일: 2026-10-25. 가상 시청·와동 샘플 6곳을 새 목록에서 제외하고 기존 2곳을 유지한 뒤 5곳을 추가했다. 현재 활성 식당은 7곳, 메뉴는 90개다. 식당과 메뉴는 카카오맵 상세 페이지의 공개 자료를 확인했다.

| 식당 | 등록 메뉴 | 출처 |
| --- | ---: | --- |
| 포크너 | 16 | [카카오맵 메뉴](https://place.map.kakao.com/589846825#menuInfo) |
| 히또시 | 19 | [카카오맵 메뉴](https://place.map.kakao.com/712291276#menuInfo) |
| 30센치옛날수제왕돈가스 | 14 | [카카오맵 메뉴](https://place.map.kakao.com/1325696737#menuInfo) |
| 소담촌 안산중앙역점 | 15 | [카카오맵 메뉴](https://place.map.kakao.com/395041368#menuInfo) |
| 춘천명물닭갈비막국수 | 16 | [카카오맵 메뉴](https://place.map.kakao.com/16311884#menuInfo) |
| 삼겹식당 안산중앙역점 · 기존 ID 유지 | 5 | [카카오맵 메뉴](https://place.map.kakao.com/1820403342#menuInfo) |
| 봉구스밥버거 중앙역점 · 기존 ID 유지 | 5 | [카카오맵 메뉴](https://place.map.kakao.com/24179146#menuInfo), [브랜드 공식 메뉴·사진](https://www.bongousse.co.kr/Menu_list.asp) |

## 이름과 사진

메뉴의 원래 이름과 표시 가격은 유지하고 카테고리는 기본 음식명으로 분류했다. 예를 들어 바질 페스토 파스타·명란 크림 파스타는 파스타, 여러 라멘은 라멘, 월남쌈 샤브 메뉴는 샤브샤브다. 기존 카테고리의 매운 아부라소바도 아부라소바로 바꿨다. 바게트 추가는 주문 메뉴에 남기되 독립 식사 후보에서는 제외한다.

39개 메뉴에 해당 메뉴의 공개 사진 URL을 연결했다. 히또시는 매장 메뉴와 이름이 정확히 같은 배달 메뉴의 사진만 연결했고 가격은 매장 메뉴 기준이다. 봉구스는 지점의 메뉴명·가격을 대조한 공식 상품 사진을 사용한다. 나머지는 메뉴별 사진이 없어 빈 배열로 남기며 화면에 식기 모양 자리를 표시한다. 식당 카드에는 해당 매장의 대표 사진을 사용한다. 사진 URL이 바뀌거나 로딩에 실패하면 같은 자리 표시로 대체한다.

공개 자료만으로 전체 재료·알레르기를 확인할 수 없어 새 메뉴의 `informationStatus`는 `INCOMPLETE`다. 제한을 등록한 모임에서는 기존의 보수적 필터가 적용된다. 메뉴나 연락처를 임의로 추정하지 않는다. 카카오맵에 전화가 없는 춘천명물닭갈비막국수는 `정보 미등록`으로 저장한다.

## 위치

7곳 모두 [중앙역 4호선 1번출구](https://place.map.kakao.com/27446506)에서 직선 1km 안에 있다. 지도에서 해당 장소를 선택해 공유한 최종 URL의 장소 ID와 좌표를 대조했다. WCONGNAMUL 좌표는 EPSG:5181 좌표로 환산하고 WGS84 위경도로 변환했으며, [카카오 공식 좌표 변환 예제](https://apis.map.kakao.com/web/documentation/#Coords_toLatLng)와 일치하는지 검사했다.

기존 삼겹식당의 잘못된 민속공원로 85 주소·좌표를 실제 삼겹식당 중앙역의 중앙대로 929 주소·좌표로 보정했다. 기존 식당 ID·소유자·주문 설정·등록 시각은 유지한다. 봉구스도 같은 방식으로 정확한 위치·전화·대표 사진을 보강했다.

## 파일과 데이터 교체

- `server/kakao-observed-menus.json`: 신규 5곳에서 직접 확인한 메뉴명·가격·사진 URL.
- `server/existing-store-menu-source.json`: 유지한 2곳의 메뉴·출처·주소 보정 근거.
- `server/catalog-coordinates.json`: 장소 ID·공유 링크·원본 좌표·변환한 위경도.
- `scripts/build-jungang-catalog.mjs`: 자료를 합쳐 서버 기본 카탈로그와 클라이언트 미리보기 자료를 생성.
- `server/new-catalog-source.json`, `server/demo-catalog.json`: 최종 등록 자료.

변경 전 SQLite는 `backups/catalog-before-2026-10-25T06-33-24-263Z-3226a526.sqlite`에 온라인 백업했다. 기존 계정·파티·주문 본문이 백업과 완전히 같은지 검증했다. 제외한 샘플은 `catalogRetired`로 목록에서 숨겨 과거 파티·주문의 참조를 보존한다. 새 후보 생성·주변 식당 수·사장님 목록·새 QR 주문에서는 나오지 않는다. 이전 가상 자료는 자동 테스트 fixture에서만 사용한다.

```powershell
node scripts/build-jungang-catalog.mjs
npm run catalog:replace -- --catalog server/new-catalog-source.json --retire-ids demo-city-a,demo-city-b,demo-city-c,demo-wadong-a,demo-wadong-b,demo-wadong-c --update-restaurant-ids 70cf20c4-3e73-4df4-ba96-514e8be33605,c99490dc-47b7-4f00-abf2-334d66f608bf
```

위 명령은 검토만 한다. 실제 반영은 끝에 `--apply`를 붙인다. 각 반영 전 온라인 백업을 만들며 같은 revision 재실행은 중복 등록하지 않는다. 향후 자료를 바꿀 때에는 출처·가격·사진과 revision을 함께 검토해야 한다.
