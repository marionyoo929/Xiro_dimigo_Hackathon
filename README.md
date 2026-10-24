# 시로

React + TypeScript + Vite로 만든 시연용 웹 기본 틀입니다.
패키지 이름은 `dimigo-hackathon`입니다.

## 실행

Node.js 22.12 이상을 권장합니다.

```sh
npm install
npm run dev
```

터미널에 표시되는 로컬 주소로 접속합니다. PowerShell에서 스크립트 실행 정책으로
`npm`이 차단되면 `npm.cmd install`, `npm.cmd run dev`를 사용합니다.

## 빌드

```sh
npm run build
npm run preview
```

TypeScript 검사 후 `dist/`에 배포 파일을 생성합니다.

## 파일 역할

- `src/main.tsx`: React 시작점과 공통 스타일 적용
- `src/App.tsx`: 홈 → 파티 생성 → 대기실 → 메뉴 소거 → 결과 순서의 화면 전환
- `src/pages/Home.tsx`: 홈과 파티 만들기 버튼
- `src/pages/CreateParty.tsx`: 파티 생성 화면
- `src/pages/WaitingRoom.tsx`: 대기실 화면
- `src/pages/MenuVote.tsx`: 메뉴 소거 화면
- `src/pages/Result.tsx`: 결과 화면과 홈으로 돌아가기 버튼
- `src/types/`: 공통 타입과 화면 이동 콜백 타입
- `src/styles/`: 연분홍 배경과 코랄 버튼 등 공통 스타일
- `src/components/PlaceMap.tsx`: 카카오 지도, 장소 마커, 실제 거리 기준 반경 원
- `src/lib/kakaoMaps.ts`: 지도 SDK 로딩 및 장소 검색 어댑터
- `src/data/`: 향후 샘플 데이터
- `src/store/`: 향후 화면 간 공유 상태
- `public/images/`, `public/icons/`: 나중에 추가할 이미지와 아이콘

## 카카오 지도 설정

프로젝트 루트(package.json 옆)에 `.env.local`을 만들고 아래 변수를 설정합니다.
키 파일은 Git에서 제외되며 `.env.example`에는 변수명만 제공합니다.

```env
VITE_KAKAO_MAP_APP_KEY=카카오_JavaScript_키
```

카카오디벨로퍼스에서 해당 앱의 카카오맵 사용 설정을 ON으로 켜고,
JavaScript 키의 SDK 도메인에 `http://localhost:5173`을 등록합니다.
배포 시에는 배포 도메인도 등록하세요. REST API 키가 아닌 JavaScript 키를 사용합니다.
환경변수 변경 후에는 개발 서버를 다시 실행하세요.
개발 서버는 등록 도메인과 맞추기 위해 5173 포트를 고정해서 사용합니다.

게스트로 시작한 뒤 장소 이름/주소를 검색하고 결과 목록이나 마커에서 장소를 선택합니다.
검색 반경은 200m~1km 슬라이더(10m 단위)로 설정하며 지도에 실제 거리 기준 분홍색 점선 원으로 표시됩니다.
주변 식당 수는 선택한 반경 안의 시로 등록 식당 수입니다. 카카오 음식점 검색 결과로 집계하지 않습니다.
모임 조건에서 파티 이름과 예산을 정하고, 가운데 + 버튼으로 파티를 생성합니다.
장소 ID, 이름, 주소, 위경도, 반경, 예산은 현재 탭의 sessionStorage에 저장되며
대기실에서 확인하거나 장소·조건 변경으로 다시 설정할 수 있습니다.

관리자/사업자 등록 화면이 있다는 전제로 `src/data/registeredCatalog.ts`에 시연용 등록 식당·메뉴를 둡니다.
가상의 식당과 메뉴이며 실제 제휴 정보가 아닙니다. 서울시청/와동공원 인근 위치로 등록되어 있습니다.
일반 파티의 메뉴 후보는 반경 안 등록 식당에 연결된 판매 중 메뉴 중 예산 이하 메뉴에서만 생성합니다.
가격대와 해당 카테고리를 판매하는 식당 수를 집계하며 품절·숨김·미등록 식당 메뉴는 제외합니다.
등록 결과가 없으면 후보도 비어 있으며, 기존 샘플 메뉴로 채우지 않습니다.
명시적인 개발 경로 `/dev/sample-party/menu`의 예전 샘플은 별도로 유지합니다.
등록·후보 API 연동 위치와 아직 필요한 계약은 `../docs/지도_등록데이터_연동.md`에 기록했습니다.
파티 정보는 현재 브라우저 탭에만 저장되며 여러 기기 간 실시간 공유는 별도 서버가 필요합니다.

## 검증

`npm test`로 검색 좌표 변환, 주소 대체, 페이지 정보, 빈 결과/실패/시간 초과,
SDK 중복 로딩 방지와 재시도, 반경 한계와 거리 경계, 등록 식당 중복 제거, 메뉴 연결·판매 상태·예산·가격대 집계를 검사합니다.
`npm run build`는 TypeScript 검사와 배포 빌드입니다.
`node_modules/`, `dist/`, 실제 환경변수 파일은 Git에서 제외합니다.
