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
- `src/components/`: 향후 공통 UI
- `src/data/`: 향후 샘플 데이터
- `src/store/`: 향후 화면 간 공유 상태
- `public/images/`, `public/icons/`: 나중에 추가할 이미지와 아이콘

현재 각 화면은 제목과 이동 버튼만 표시합니다. 화면은 React 상태로 전환하며,
새로고침하면 홈으로 돌아옵니다. 이미지나 아이콘 파일 없이 실행할 수 있습니다.
`node_modules/`, `dist/`, 실제 환경변수 파일은 Git에서 제외합니다.
