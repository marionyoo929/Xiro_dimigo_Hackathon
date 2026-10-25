# 시로 서비스 API 명세서

문서 버전: 1.0.0-draft · 작성일: 2026-10-24 · 기본 경로: `/api/v1`

사용자가 제공한 「시로 서비스 API 요구사항 초안」을 기반으로 작성했다. 이 문서는 **구현 전 제안 명세**이며 실제 서버 구현 여부를 나타내지 않는다. 기계 판독용 계약은 같은 폴더의 `openapi.yaml`이다. `요약.txt`의 결제 기반 수수료 설명보다 이번 요구사항의 **식당 주문 확인 기반 수수료**를 우선한다.

## 1. 서비스 범위

시로는 참가자들이 주변 음식 카테고리와 식당을 공동으로 소거하고, 방문한 매장에서 각자 선택한 메뉴를 하나의 주문으로 제출하는 서비스다. 사용자 앱과 모바일 웹은 동일한 API를 사용한다. 사장님 웹은 소유 매장의 메뉴와 주문을 관리한다.

서비스 내부 결제는 제공하지 않는다. `CONFIRMED`는 식당의 주문 수락 완료를 뜻하며 결제·조리·식사 완료를 뜻하지 않는다. 식당이 주문을 확인한 시점에 수수료 청구 근거를 기록한다.

MVP에 포함하는 기능은 사용자·게스트 인증, 식사 제한, 파티·초대, 두 단계의 후보 소거, 식당 선택, QR 연결, 개인 메뉴 선택, 주문 제출·수락·거절, 수수료 근거 조회다. 관리자 승인·신고, 광고, 데이터 판매, 세금계산서 발행·수납 API는 후속 범위다.

## 2. 확정 요구사항과 임시 정책

이 표의 ‘임시’ 항목은 구현을 위한 제안이며 서비스 정책 승인 전 확정 사항으로 취급하지 않는다. OpenAPI의 관련 작업에는 `x-policy-status: provisional`을 표시한다.

| 항목 | 적용 계약 | 구분 |
|---|---|---|
| 소거 | 한 사람의 소거로 전체 후보가 소거된다. 본인의 기록만 취소할 수 있다. | 요구사항 |
| 익명성 | 다른 사람의 소거 기록·작성자·제한 상세는 공개하지 않는다. | 요구사항 |
| 검토 종료 | 전체 후보 열람 및 모든 활성 참가자의 명시적 완료가 필요하다. | 요구사항 |
| 주문 성립 | 식당 확인 시 주문 수락 및 수수료 근거를 기록한다. | 요구사항 |
| 참가자 변경 | 입장·탈퇴·강퇴는 `WAITING`에서만 허용한다. 방장 양도는 MVP에서 제외한다. | 임시 |
| 게스트 | 초대 게스트는 해당 파티에만 접근한다. QR 게스트는 해당 주문에만 접근한다. 계정 전환은 제외한다. | 임시 |
| 제한 확인 | 참가자가 제한 목록의 최신 버전을 확인해야 후보 생성을 시작한다. | 임시 |
| 제한 정보 부족 | 필수 제한과의 충돌 여부를 판단할 정보가 부족한 메뉴는 후보 생성과 주문에서 제외한다. | 임시 |
| 분류 | 운영자가 관리하는 카테고리 ID를 쓴다. 분류할 수 없는 메뉴는 후보에서 제외한다. | 임시 |
| 카테고리 제외 | 파티 제한과 충돌하는 판매 메뉴가 해당 카테고리의 검색 대상에 하나라도 있으면 그 카테고리를 제외하는 보수적 규칙을 쓴다. | 임시 |
| 후보가 0개 | 생성 결과가 0개면 작업 실패로 처리한다. 전체 소거 시 본인이 소거를 취소한다. 방장 일괄 복구는 제공하지 않는다. | 임시 |
| 검토 변경 | 완료 후 수정하려면 먼저 완료를 취소한다. 후보의 전체 소거 상태가 바뀌면 해당 단계의 모든 완료를 해제한다. 열람 기록은 유지한다. | 임시 |
| 최종 식당 | 검토 종료 후 방장만 선택한다. 선택 이후 되돌리기는 MVP에서 제공하지 않는다. | 임시 |
| 주문 제출 | 전원 메뉴 선택 완료 후 방장이 제출한다. 자동 제출하지 않는다. | 임시 |
| 부분 수락 | 전체 주문 수락 또는 전체 거절만 허용한다. `acceptedItems`로 부분 수락하지 않는다. | 임시 |
| 주문 거절 | `REJECTED` / `ORDER_REJECTED`로 종료하며 자동 재주문하지 않는다. | 임시 |
| 금액 | 서버가 메뉴·옵션 금액을 계산한다. 사업자의 주문 금액 직접 수정은 제공하지 않는다. | 임시 |
| 가격 변경 | 제출 시 최신 가격·판매 상태를 검증한다. 금액이 달라졌다면 갱신된 초안을 반환하고 전원 완료를 해제한다. 다시 확인한 후 제출한다. | 임시 |
| 수수료 | 적용 정책이 있으면 `BILLABLE`, 정책이 없으면 `PENDING`으로 기록한다. 기본 요율을 가정하지 않는다. | 임시 |
| 게스트 보관 | 종료 즉시 접근을 만료하고 식사 제한을 운영 데이터에서 삭제한다. 종료되지 않은 세션도 발급 후 24시간에 만료한다. 주문 스냅샷에는 제한을 복사하지 않는다. | 임시 |
| 소거 인원수 | 참가자 응답에서 `eliminatorCount`를 제외한다. | 임시 |

광고 노출, 게스트 보관 기간의 운영·백업 처리, 수수료 요율·반올림·과세 규칙, 계정 인증 공급자는 출시 전 별도로 확정해야 한다. 특정 메뉴의 필터 통과는 실제 조리 환경의 안전을 보증하는 표시로 사용하지 않는다.

## 3. 공통 규약

### 3.1 요청과 응답

- JSON 요청은 `Content-Type: application/json`을 사용한다. 파일 업로드는 이 버전에서 제공하지 않는다.
- 정상 응답은 리소스 객체를 직접 반환한다. 목록은 `{ "items": [], "nextCursor": null }`을 반환한다.
- ID는 의미를 추측하거나 정렬에 사용할 수 없는 문자열이다. 예시의 접두사는 설명용이다.
- 날짜는 ISO 8601 UTC(`2026-10-24T03:30:00Z`), 표시 시간은 클라이언트에서 `Asia/Seoul`로 변환한다.
- 금액은 KRW 원 단위 0 이상의 정수, 수량은 1~99, 거리는 미터 단위다. 위치는 WGS84 위도 -90~90, 경도 -180~180이다.
- 별도 명시 없는 목록의 `limit`은 기본 20, 최대 100이다. `cursor`는 불투명한 문자열이다. 다음 페이지는 기존 필터를 유지한다.
- 알 수 없는 필드와 명시하지 않은 enum 값은 `422 VALIDATION_ERROR`로 거절한다. PATCH는 생략한 필드를 유지하고 명시적 `null`은 스키마가 허용할 때만 수락한다.
- 성공: 조회·수정·명령 `200`, 생성 `201`, 비동기 작업 접수 `202`, 본문 없는 삭제 `204`.

### 3.2 인증과 권한

`Authorization: Bearer <accessToken 또는 guestToken>`을 사용한다. 두 토큰은 동일한 헤더를 사용하지만 서버가 주체 유형과 범위를 구분한다. 만료되거나 유효하지 않은 토큰은 `401`이다.

| 역할 | 허용 범위 |
|---|---|
| USER | 본인 프로필·제한·참여 파티·본인 주문 항목 |
| PARTY_GUEST | 초대로 연결된 파티 및 본인 제한·주문 항목 |
| ORDER_GUEST | QR 세션으로 생성된 단일 주문 및 본인 항목 |
| HOST | USER 또는 PARTY_GUEST의 권한에 파티 운영 권한 추가. MVP 파티 생성은 USER만 가능 |
| MERCHANT | 서버에서 권한을 부여받은 사업자. 본인 소유 매장·메뉴·주문·수수료 |

HOST는 계정의 전역 역할이 아니라 파티 멤버 역할이다. 클라이언트가 `role`, 가격, 매장 소유자 ID를 지정해 권한을 얻을 수 없다. 다른 파티·주문·매장의 ID를 사용하면 `404 RESOURCE_NOT_FOUND`로 응답해 존재 여부를 숨긴다. 현재 파티에 대한 방장 권한 부족은 `403 HOST_PERMISSION_REQUIRED`다.

로그인 공급자는 배포 설정에서 결정한다. 로그인 요청의 `provider`는 서버가 허용한 공급자만 사용할 수 있으며 지원 목록이 확정되기 전 특정 SNS 연동을 보장하지 않는다. `authorizationCode`는 서버가 공급자에게 검증한다. `redirectUri`는 등록된 값만 허용하며 필요한 공급자에는 PKCE `codeVerifier`를 요구한다. 로그인 흐름의 state·nonce 검증은 인증 연동 구현에 포함한다.

게스트 세션 생성은 초대 검증·정원 검증·멤버 추가를 하나의 작업으로 수행한다. 발급만 하고 별도 join을 요구하지 않는다. `deviceId`는 복구용 인증 비밀이 아니며 로그인을 대신하지 않는다. 토큰을 잃은 게스트의 자동 신원 복구는 지원하지 않는다.

### 3.3 멱등성과 동시성

생성·join·후보 생성·단계 종료·QR 연결·주문 제출·수락·거절 POST에는 `Idempotency-Key`를 필수로 사용한다. 클라이언트는 작업마다 128비트 이상 난수 기반 키를 생성한다. 열람 기록과 완료/완료 취소는 자체 멱등이다. 동일 주체·HTTP 메서드·정규화 경로·키의 결과를 24시간 보관하고 같은 본문이면 최초 상태 코드와 본문을 재전송한다. 인증 전 게스트 발급 요청은 발급 API·진입 토큰·키를 범위로 삼고 요청 본문 해시를 검증한다. 다른 본문으로 재사용하면 `409 IDEMPOTENCY_KEY_REUSED`, 처리 중이면 `409 REQUEST_IN_PROGRESS`를 반환한다. 키는 인증 및 리소스 권한을 대신하지 않는다.

파티 설정 변경·취소·단계 종료·식당 선택·QR 연결과 주문 항목 변경·선택 완료·제출·수락·거절에는 `If-Match: "<version>"`를 요구한다. 요청 대상이 멤버·선택·연결 하위 경로라면 Party 버전, 주문 항목·사업자 주문 경로라면 Order 버전을 쓴다. 응답의 `version` 및 `ETag`가 새 버전이다. 헤더 누락은 `428 PRECONDITION_REQUIRED`, 불일치는 `412 VERSION_CONFLICT`다. 클라이언트는 최신 상태를 조회하고 사용자 의도를 유지할 수 있을 때만 새 키로 재시도한다. 이미 완료된 멱등성 키 재전송은 기존 결과를 우선 반환한다.

소거는 `(partyId, candidateSetId, candidateId, memberId)` 유일 제약으로 처리한다. 다른 사람이 이미 소거했어도 본인의 소거를 추가할 수 있다. 본인 소거 PUT/DELETE 반복은 항상 `200`이며 다른 사람의 소거를 취소하는 경로는 제공하지 않는다. 후보 변경과 단계 확정은 같은 잠금 범위에서 검증해 확정 후 변경을 막는다. 열람·접속 상태만 바뀔 때는 Party 버전을 증가시키지 않는다.

주문 확정과 거절은 같은 주문을 잠근다. 둘 중 먼저 커밋한 하나만 성공한다. `orderId`당 수수료 근거는 한 건만 존재한다. 실시간 이벤트는 DB 트랜잭션에 outbox를 기록한 후 발행한다. 네트워크 전송 자체를 DB 트랜잭션 안에서 성공했다고 가정하지 않는다.

## 4. 상태와 단계 흐름

### 4.1 파티 상태

```text
WAITING → CATEGORY_GENERATING → CATEGORY_REVIEW → CATEGORY_FINALIZED
        → RESTAURANT_GENERATING → RESTAURANT_REVIEW → RESTAURANT_FINALIZED
        → RESTAURANT_SELECTED → [STORE_CONNECTED] → ORDERING
        → ORDER_SUBMITTED → ORDER_CONFIRMED 또는 ORDER_REJECTED
```

`CATEGORY_FINALIZED`, `RESTAURANT_FINALIZED`, `ORDER_REJECTED`는 초안의 누락된 경계를 보완한 **제안 상태**다. `STORE_CONNECTED`는 연결 트랜잭션의 이력 상태이며 QR 연결 성공 응답에서는 주문 초안 생성까지 마친 `ORDERING`을 반환한다.

| 호출 | 호출 전 → 호출 후 | 조건 |
|---|---|---|
| 카테고리 생성 | WAITING → CATEGORY_GENERATING → CATEGORY_REVIEW | 방장, 전원 제한 확인, 후보 1개 이상 |
| 카테고리 확정 | CATEGORY_REVIEW → CATEGORY_FINALIZED | 전원 완료, 활성 후보 1개 이상 |
| 식당 생성 | CATEGORY_FINALIZED → RESTAURANT_GENERATING → RESTAURANT_REVIEW | 방장, 확정 카테고리 스냅샷 |
| 식당 검토 확정 | RESTAURANT_REVIEW → RESTAURANT_FINALIZED | 전원 완료, 활성 후보 1개 이상 |
| 최종 식당 선택 | RESTAURANT_FINALIZED → RESTAURANT_SELECTED | 방장, 살아남은 후보 |
| QR 연결 | RESTAURANT_SELECTED → ORDERING | 방장, 선택 식당 일치, 주문 가능 |
| 주문 제출 | ORDERING → ORDER_SUBMITTED | 방장, 전원 선택 완료, 최신 메뉴 검증 |
| 식당 수락 | ORDER_SUBMITTED → ORDER_CONFIRMED | 매장 소유 사업자 |
| 식당 거절 | ORDER_SUBMITTED → ORDER_REJECTED | 매장 소유 사업자 |
| 파티 취소 | WAITING~ORDERING → CANCELED | 방장. 제출 이후 취소 제외 |

생성 작업 실패 시 카테고리는 `WAITING`, 식당은 `CATEGORY_FINALIZED`로 복원하고 실패 원인을 Job에 보관한다. 성공한 후보 집합은 통째로 게시하며 부분 결과는 노출하지 않는다. 작업 중 취소된 파티에는 늦게 도착한 결과를 반영하지 않고 Job을 `CANCELED`로 끝낸다. 진행 중 파티의 게스트가 만료되어 더 이상 참여할 수 없으면 자동 완료하지 않는다. MVP에서는 방장이 파티를 취소하고 새 파티를 시작한다.

기존 성공 후보의 재생성은 MVP에서 제외한다. 생성 중 중복 요청은 같은 작업을 반환하거나 `GENERATION_IN_PROGRESS`로 거절한다. 실패 후에는 새 멱등성 키로 재시도한다.

### 4.2 주문·수수료 상태

```text
주문: DRAFT → SUBMITTED → CONFIRMED 또는 REJECTED
      DRAFT → CANCELED (파티 취소 또는 QR 게스트 세션 만료)
수수료: PENDING → BILLABLE → INVOICED → PAID
        PENDING 또는 BILLABLE → VOIDED (후속 운영 기능)
```

제출된 QR 게스트 주문의 접근 토큰이 만료돼도 매장의 수락·거절 처리는 유지한다. 게스트 토큰 만료만으로 제출 주문을 취소하지 않는다. 거절 주문에는 수수료를 생성하지 않는다. INVOICED/PAID/VOIDED 변경 API는 이 문서 범위 밖이다.

## 5. 리소스 모델

OpenAPI `components.schemas`에 전체 필드·필수 여부·범위를 정의한다. 핵심 식별 관계는 다음과 같다.

| 모델 | 주요 필드 |
|---|---|
| User / GuestUser | id, displayName, principalType, roles |
| DietaryRestriction | id, type, targetCode, label, severity=HARD_BLOCK |
| RestrictionCollection | items, revision |
| Party | id, title, hostMemberId, state, version, location, searchRadiusMeters, budgetPerPerson, mealStyle, memberCount, selectedRestaurantId, orderId, generationJobId, myMemberId |
| Member | id, displayName, role, connectionStatus, restrictionConfirmed, categoryReviewStatus, restaurantReviewStatus |
| CandidateSet | id, kind, revision, totalCount, activeCount, finalized |
| CategoryCandidate | id, candidateSetId, category, nearbyRestaurantCount, priceRange, status, viewedByMe, eliminatedByMe |
| RestaurantCandidate | id, candidateSetId, restaurant, representativeMenus, matchingCategoryIds, status, viewedByMe, eliminatedByMe |
| Order | id, type, status, version, partyId, restaurantId, members, totalAmount, pricingVersion, submittedAt, confirmedAt, rejection |
| OrderItem | id, menuId, menuName, quantity, options, request, unitPrice, lineAmount, menuVersion |
| Commission | id, orderId, restaurantId, basis, orderAmount, policyId, feeType, feeRate, feeAmount, status |
| Job | id, partyId, kind, status, candidateSetId, error, createdAt, completedAt |

주문 항목과 주문은 계산 결과의 스냅샷이다. 메뉴 삭제는 판매 중단을 포함한 논리 삭제로 처리하고 과거 주문의 메뉴명·가격을 유지한다. 식사 제한 목록과 개인 소거 내역은 공용 Party/Member/Order에 포함하지 않는다.

`mealStyle`은 MVP에서 `INDIVIDUAL_ORDER`만 허용한다. 파티 위치·반경·예산은 `WAITING`에서만 수정한다. 반경은 100~5000m, 예산은 0 이상이며 `null`이면 미설정이다. 이 범위는 임시 운영 제한이다. 정원은 서버 설정 `maxMembers`로 반환하고 초과 참여를 거절한다.

## 6. API 목록과 권한

다음 목록은 기능 설명용 요약이다. **개별 API의 헤더·파라미터·필수 요청 필드·성공 및 오류 응답은 `openapi.yaml`을 기준으로 한다.** ‘참가자’는 해당 파티에 속한 인증 사용자 또는 파티 게스트이며, ‘주문자’는 해당 주문 참가자 또는 QR 주문 게스트다.

### 6.1 인증·프로필·기준 정보

| 메서드 | 경로 | 권한 | 용도 |
|---|---|---|---|
| POST | /auth/login | 공개 | 공급자 인증 코드 교환 |
| POST | /auth/refresh | refresh token | 토큰 회전; 이전 refresh token 폐기 |
| POST | /auth/logout | 사용자 | refresh token 폐기 및 세션 종료 |
| GET | /me | 인증 주체 | 본인 정보 |
| POST | /guest-sessions | 유효 초대 | 게스트 생성 및 파티 입장 |
| GET | /food-categories | 인증 주체 | 운영 카테고리 목록 |
| GET | /ingredients | 인증 주체 | 메뉴 재료 코드 목록 |
| GET | /restriction-targets | 인증 주체 | 제한 대상 코드·유형 조회 |

게스트 발급 요청은 `{ "inviteToken": "...", "displayName": "시온", "deviceId": "..." }`, 응답은 `{ "guestToken": "...", "expiresAt": "...", "guestUser": {...}, "partyId": "...", "memberId": "..." }`이다. 로그인·게스트 발급·QR 공개 API에는 서버 측 요청률 제한을 적용한다. 게스트는 refresh를 사용할 수 없다.

### 6.2 개인 식사 제한

| 메서드 | 경로 | 권한 | 용도 |
|---|---|---|---|
| GET | /me/dietary-restrictions | 사용자·게스트 | 본인 제한 및 revision 조회 |
| PUT | /me/dietary-restrictions | 사용자·게스트 | 제한 전체 교체 |
| POST | /me/dietary-restrictions | 사용자·게스트 | 단일 제한 생성 |
| DELETE | /me/dietary-restrictions/{restrictionId} | 본인 | 단일 제한 삭제 |
| PUT | /parties/{partyId}/members/me/dietary-confirmation | 참가자 | 최신 제한 확인 또는 확인 취소 |

```json
{
  "type": "ALLERGY",
  "targetCode": "PEANUT",
  "label": "땅콩",
  "severity": "HARD_BLOCK"
}
```

유형은 `ALLERGY`, `RELIGIOUS`, `VEGETARIAN`, `INGREDIENT_AVOIDANCE`, `MEDICAL`, `OTHER`다. 자유 텍스트만으로 필터를 실행하지 않으며 `targetCode`가 기준 정보와 일치해야 한다. `OTHER`도 운영자가 등록한 코드가 필요하다. 기호는 소거로 표현한다.

제한 수정에는 제한 목록 revision 기준 `If-Match`를 사용한다. 수정되면 `WAITING`인 소속 파티의 본인 제한 확인을 해제한다. 생성 시작 시 확인된 제한을 파티 전용 스냅샷으로 고정한다. 이후 프로필 수정은 현재 파티 스냅샷을 변경하지 않는다. 현재 파티 제한을 바꿔야 한다면 파티를 취소하고 다시 시작한다. QR 일반 주문의 초안 중에 제한을 바꾸면 본인 메뉴 선택 완료를 해제하고 Order 버전을 증가시킨다. 이후 최신 제한으로 기존 항목을 재검증한 후 완료해야 하며, 제출 시 제한을 고정한다.

### 6.3 파티·초대·멤버

| 메서드 | 경로 | 권한 | 조건·결과 |
|---|---|---|---|
| POST | /parties | USER | 방장을 멤버로 포함해 WAITING 파티 생성 |
| GET | /parties/{partyId} | 참가자 | 전체 파티 스냅샷 |
| PATCH | /parties/{partyId} | 방장 | WAITING에서 조건 수정 |
| DELETE | /parties/{partyId} | 방장 | 취소; 물리 삭제하지 않음 |
| GET | /me/parties | USER·PARTY_GUEST | 접근 가능한 파티 목록 |
| POST | /parties/{partyId}/invite-links | 방장 | WAITING에서 만료 시각 있는 초대 발급 |
| POST | /party-invites/{inviteToken}/join | USER | WAITING에서 멤버 추가 |
| GET | /parties/{partyId}/members | 참가자 | 공개 가능한 멤버 상태 |
| DELETE | /parties/{partyId}/members/{memberId} | 본인 또는 방장 | WAITING에서 탈퇴·강퇴; 방장 제거 불가 |
| PATCH | /parties/{partyId}/members/me | 참가자 | WAITING에서 닉네임 수정 |

생성 예시:

```json
{
  "title": "토요일 점심 모임",
  "scheduledAt": "2026-10-24T03:30:00Z",
  "location": {
    "latitude": 37.5665,
    "longitude": 126.978,
    "address": "서울특별시 중구"
  },
  "searchRadiusMeters": 1000,
  "budgetPerPerson": 15000,
  "mealStyle": "INDIVIDUAL_ORDER"
}
```

초대 응답의 `inviteUrl`은 모바일 웹 진입 URL이다. 초대 토큰을 파티 조회용 인증 토큰으로 쓰지 않는다. 초대는 기본 24시간 유효하며 파티가 WAITING을 벗어나면 사용할 수 없다. 이미 참여 중인 계정의 join은 기존 멤버를 반환한다. 게스트는 `/guest-sessions`로만 새로 입장한다.

### 6.4 음식 카테고리 후보·검토

| 메서드 | 경로 | 권한 | 결과 |
|---|---|---|---|
| POST | /parties/{partyId}/category-candidates/generate | 방장 | 202 Job; WAITING에서 시작 |
| GET | /parties/{partyId}/category-candidates | 참가자 | 고정 후보 집합 및 페이지 |
| GET | /parties/{partyId}/category-candidates/{candidateId} | 참가자 | 후보 상세 |
| POST | /parties/{partyId}/category-candidates/{candidateId}/view | 참가자 | 본인 최초 열람 기록 |
| PUT | /parties/{partyId}/category-candidates/{candidateId}/elimination | 참가자 | 본인 소거 추가 |
| DELETE | /parties/{partyId}/category-candidates/{candidateId}/elimination | 참가자 | 본인 소거 취소 |
| GET | /parties/{partyId}/category-review/progress | 참가자 | 본인 열람 수와 전원 완료 진행도 |
| POST | /parties/{partyId}/category-review/complete | 참가자 | 본인 검토 완료 |
| DELETE | /parties/{partyId}/category-review/complete | 참가자 | 본인 완료 취소 |
| POST | /parties/{partyId}/category-review/finalize | 방장 | CATEGORY_FINALIZED; 식당 생성은 별도 요청 |
| GET | /jobs/{jobId} | 해당 파티 참가자 | 작업 진행·실패 조회 |

생성은 항상 비동기 `202`로 통일한다. `Location`은 Job 조회 경로이며 `Retry-After: 2`를 권장한다. 후보 생성은 검색 시점의 등록·판매 중 메뉴, 파티 반경·예산·제한 스냅샷을 사용한다. 예산이 있으면 해당 가격 이하 메뉴만 검토하고, 같은 카테고리의 제한 충돌 여부를 보수적으로 적용한다. 식당·메뉴 변경은 이미 게시한 후보 집합을 재작성하지 않는다.

열람 수의 분모는 게시된 고정 후보 집합 전체다. 소거된 후보도 열람 대상으로 남겨 클라이언트에서 비활성 카드 등으로 확인할 수 있어야 한다. 같은 후보의 반복 view는 `viewedCount`를 늘리지 않는다. 실제 화면 표시 시에만 호출한다. 시간 초과나 접속 종료를 완료로 간주하지 않는다.

```json
{
  "candidateSetId": "set_category_123",
  "viewedCount": 18,
  "totalCount": 20,
  "reviewCompleted": false,
  "partyCompletedMemberCount": 2,
  "partyMemberCount": 4,
  "allMembersCompleted": false
}
```

완료·소거·복구는 `CATEGORY_REVIEW`에서만 허용한다. 본인이 완료한 상태에서 소거를 수정하면 `409 REVIEW_LOCKED`다. 완료를 취소하고 수정한다. 전체 소거 상태가 변하면 모든 완료를 취소하고 `review.reset`을 알린다. 다른 소거가 남아 전체 상태가 바뀌지 않으면 다른 사람의 완료를 취소하지 않는다.

마지막 후보 소거도 허용한다. 활성 후보가 0개면 확정만 `409 NO_ACTIVE_CANDIDATES`로 막고, 각자가 자신의 소거를 취소해 복구한다. 조회 시 `eliminatedByMe`를 제공하므로 복구 가능한 후보를 확인할 수 있다.

### 6.5 식당 후보·검토·선택

| 메서드 | 경로 | 권한 | 결과 |
|---|---|---|---|
| POST | /parties/{partyId}/restaurant-candidates/generate | 방장 | CATEGORY_FINALIZED에서 202 Job |
| GET | /parties/{partyId}/restaurant-candidates | 참가자 | 확정 카테고리에 맞는 식당 후보 |
| GET | /parties/{partyId}/restaurant-candidates/{candidateId} | 참가자 | 후보 상세 |
| GET | /parties/{partyId}/restaurant-candidates/{candidateId}/menus | 참가자 | 대표 메뉴 외 판매 메뉴 |
| POST | /parties/{partyId}/restaurant-candidates/{candidateId}/view | 참가자 | 본인 열람 기록 |
| PUT | /parties/{partyId}/restaurant-candidates/{candidateId}/elimination | 참가자 | 본인 소거 |
| DELETE | /parties/{partyId}/restaurant-candidates/{candidateId}/elimination | 참가자 | 본인 소거 취소 |
| GET | /parties/{partyId}/restaurant-review/progress | 참가자 | 진행도 |
| POST | /parties/{partyId}/restaurant-review/complete | 참가자 | 본인 검토 완료 |
| DELETE | /parties/{partyId}/restaurant-review/complete | 참가자 | 완료 취소 |
| POST | /parties/{partyId}/restaurant-review/finalize | 방장 | RESTAURANT_FINALIZED로 전환 |
| PUT | /parties/{partyId}/selected-restaurant | 방장 | 활성 후보를 최종 식당으로 선택 |

카테고리 검토와 동일한 열람·소거·완료 규칙을 사용한다. 식당이 하나만 남아도 자동 확정하지 않는다. 최종 선택 요청은 `{ "restaurantCandidateId": "restaurant_candidate_123" }`다. 후보 집합에 속하지 않거나 소거된 식당은 선택할 수 없다.

### 6.6 QR·주문 초안

| 메서드 | 경로 | 권한 | 결과 |
|---|---|---|---|
| GET | /store-qr/{qrToken} | 공개 | 최소 매장 정보·주문 가능 여부 |
| POST | /parties/{partyId}/store-connection | 방장 | 매장 연결과 단일 주문 초안 생성 |
| POST | /parties/{partyId}/orders | 방장 | ORDERING의 기존 초안 반환 또는 누락 초안 복구 |
| GET | /parties/{partyId}/order | 참가자 | 현재 파티 주문 |
| POST | /store-qr/{qrToken}/guest-order-sessions | 공개 | QR 일반 주문 게스트·초안 생성 |
| GET | /orders/{orderId}/menus | 주문자 | 연결 매장의 최신 메뉴·옵션 |

매장 연결 요청은 `{ "qrToken": "..." }`다. QR은 서버가 발행한 추측하기 어려운 토큰이며 원본 식당 ID나 관리자 권한을 담지 않는다. QR은 매장 식별 및 주문 진입 수단이며 현장 도착 자체를 증명하지 않는다. 테이블 식별과 현장 검증은 MVP 범위에서 제외한다.

연결 시 선택 식당 일치·QR 활성·주문 가능 여부를 검사하고 `partyId`에 대한 주문 유일 제약으로 중복 초안을 막는다. 연결 결과는 `{ "party": {...}, "order": {...} }`다. `/parties/{partyId}/orders`는 호환·복구용이며 연결 없이 주문을 만들지 않는다.

QR 일반 주문 요청은 `{ "displayName": "시온", "deviceId": "..." }`이며 응답은 `guestToken`, `expiresAt`, `guestUser`, `order`를 포함한다. 주문 `type`은 `QR_GUEST`, `partyId`는 `null`이다. 단일 주문자이므로 본인 선택 완료 후 본인이 제출한다. PARTY 유형에만 방장·전원 완료 검사를 적용한다.

### 6.7 개인 메뉴 선택·공동 주문

| 메서드 | 경로 | 권한 | 결과 |
|---|---|---|---|
| POST | /orders/{orderId}/my-items | 주문자 | 본인 항목 추가 |
| PATCH | /orders/{orderId}/my-items/{orderItemId} | 항목 작성자 | 수량·옵션·요청 수정 |
| DELETE | /orders/{orderId}/my-items/{orderItemId} | 항목 작성자 | 본인 항목 삭제 |
| GET | /orders/{orderId} | 주문자 | 공동 주문; 게스트는 소속 주문만 |
| POST | /orders/{orderId}/members/me/complete | 주문자 | 메뉴 선택 완료 |
| DELETE | /orders/{orderId}/members/me/complete | 주문자 | 메뉴 선택 완료 취소 |
| POST | /orders/{orderId}/submit | 방장·QR 본인 | 최신 검증 후 SUBMITTED |

```json
{
  "menuId": "menu_123",
  "quantity": 1,
  "options": [{ "optionId": "spicy_level", "valueId": "level_1" }],
  "request": "고수 빼주세요"
}
```

옵션 그룹은 `id`, `name`, `minSelections`, `maxSelections`, `values`를 갖는다. 값은 `id`, `name`, `additionalPrice`, `salesStatus`를 갖는다. 서버는 메뉴 소속 옵션인지, 중복 선택인지, 최소·최대 개수와 판매 상태를 검증한다. 메뉴·옵션 금액은 클라이언트가 전송하지 않는다. `unitPrice = 메뉴 가격 + 선택 옵션 추가금`, `lineAmount = unitPrice × quantity`, `totalAmount = 모든 lineAmount 합`이다. 서버 정수 범위를 초과하면 거절한다.

선택 완료한 참가자는 본인 완료를 취소해야 항목을 수정할 수 있다. 완료에는 한 개 이상의 본인 항목이 필요하며 메뉴·옵션·적용 제한을 재검증한다. 동시 변경 충돌 시 최신 주문을 다시 조회한다. 공동 주문에는 참가자 표시명과 주문 항목만 포함하고 개인 제한은 포함하지 않는다.

메뉴가 파티 제한 스냅샷과 충돌하거나 검증 정보가 부족하면 모든 파티 참가자의 추가를 차단한다. QR 일반 주문은 본인의 제한을 적용한다. 자유 요청문에 “재료 빼기”를 적어 차단을 우회할 수 없다. 옵션으로 제한을 해소할 수 있다는 모델은 MVP에서 제공하지 않는다.

제출 시 가격만 달라졌으면 초안을 최신 가격으로 갱신하고 전원 완료를 해제하며 `409 ORDER_PRICE_CHANGED`와 `details.order`를 반환한다. 이 경우 오류 응답이어도 초안 버전이 갱신되므로 새 주문·ETag를 사용한다. 품절·삭제·제한 충돌이면 제출하지 않고 해당 항목 ID와 오류를 반환한다. 제출 이후 항목과 가격은 고정하며 수정 API는 `409 ORDER_NOT_EDITABLE`이다.

### 6.8 사업자 매장·메뉴·QR

| 메서드 | 경로 | 권한 | 용도 |
|---|---|---|---|
| POST | /merchant/restaurants | MERCHANT | 본인 소유 매장 생성 |
| GET | /merchant/restaurants | MERCHANT | 소유 매장 목록 |
| GET | /merchant/restaurants/{restaurantId} | 소유 사업자 | 매장 상세 |
| PATCH | /merchant/restaurants/{restaurantId} | 소유 사업자 | 매장 수정 |
| POST | /merchant/restaurants/{restaurantId}/menus | 소유 사업자 | 메뉴 생성 |
| GET | /merchant/restaurants/{restaurantId}/menus | 소유 사업자 | 메뉴 목록 |
| GET | /merchant/menus/{menuId} | 소유 사업자 | 메뉴 상세 |
| PATCH | /merchant/menus/{menuId} | 소유 사업자 | 메뉴·옵션 수정 |
| DELETE | /merchant/menus/{menuId} | 소유 사업자 | 메뉴 논리 삭제 |
| POST | /merchant/restaurants/{restaurantId}/qr-codes | 소유 사업자 | QR 토큰 발급 |
| GET | /merchant/restaurants/{restaurantId}/qr-codes | 소유 사업자 | QR 목록 |
| DELETE | /merchant/restaurants/{restaurantId}/qr-codes/{qrCodeId} | 소유 사업자 | QR 폐기 |

QR 발급·조회·폐기와 옵션 필드는 초안의 QR 주문을 구현 가능하게 하기 위해 추가한 제안이다. QR 폐기는 새로운 연결만 차단하며 이미 제출된 주문을 취소하지 않는다. 매장 소유권 확인·사업자 권한 부여 과정은 별도 운영 범위다.

영업시간은 `{ "dayOfWeek": 1, "opensAt": "11:00", "closesAt": "22:00", "closesNextDay": false }` 형식이다. 월요일=1, 일요일=7이며 한국 시간 기준이다. 빈 배열은 정보 미등록을 뜻한다. `orderEnabled`는 수동 주문 접수 스위치다. 자정이 지나 닫는 경우 `closesNextDay=true`를 쓴다.

### 6.9 사업자 주문·수수료

| 메서드 | 경로 | 권한 | 용도 |
|---|---|---|---|
| GET | /merchant/orders | 소유 사업자 | 매장·상태·기간별 주문 목록 |
| GET | /merchant/orders/{orderId} | 소유 사업자 | 주문 상세 |
| POST | /merchant/orders/{orderId}/confirm | 소유 사업자 | 전체 수락; 요청 본문 없음 |
| POST | /merchant/orders/{orderId}/reject | 소유 사업자 | 전체 거절 |
| GET | /merchant/commissions | 소유 사업자 | 매장·상태·기간별 수수료 목록 |
| GET | /merchant/commissions/{commissionId} | 소유 사업자 | 수수료 근거 상세 |

거절 요청:

```json
{
  "reasonCode": "SOLD_OUT",
  "message": "일부 메뉴가 품절되었습니다."
}
```

거절 코드는 `SOLD_OUT`, `STORE_CLOSED`, `CAPACITY_EXCEEDED`, `OTHER`다. 확인 API는 주문 스냅샷 그대로 전체 수락하며 `acceptedItems`는 허용하지 않는다. 수락 트랜잭션은 주문 `CONFIRMED`, 사업자·시각 감사 기록, 파티 `ORDER_CONFIRMED`, 유일 수수료 근거, outbox 이벤트를 함께 저장한다. 일반 QR 주문은 파티 변경만 생략한다.

수수료 계산 예시는 42,000원 × 3% = 1,260원이지만 **3%는 확정 요율이 아니다.** 정책이 없으면 `policyId`, `feeType`, `feeRate`, `feeAmount`는 `null`, 상태는 `PENDING`이다. 정책이 있으면 확인 시점의 정책 ID와 계산 결과를 고정한다. 조회 API만 제공하며 이 단계에서 실제 출금하지 않는다.

## 7. 실시간 동기화

MVP 전송은 **SSE**로 통일한다. 초안의 `/ws/...`는 WebSocket 대안이며 이 명세에는 구현 계약으로 포함하지 않는다.

| 메서드 | 경로 | 권한 |
|---|---|---|
| GET | /parties/{partyId}/events | 참가자 |
| GET | /orders/{orderId}/events | 주문자; QR 일반 주문 포함 |
| GET | /merchant/restaurants/{restaurantId}/events | 매장 소유 사업자 |

`Accept: text/event-stream`과 Bearer 인증을 사용한다. 브라우저는 Authorization 헤더를 지원하는 fetch 스트림으로 연결한다. 토큰을 URL에 넣지 않는다. 응답은 캐시하지 않으며 약 15초 간격 heartbeat 주석을 권장한다.

```text
id: event_123
event: category.eliminated
data: {"eventId":"event_123","type":"category.eliminated","occurredAt":"2026-10-24T04:10:00Z","partyId":"party_123","resourceVersion":12,"data":{"candidateId":"candidate_123","status":"ELIMINATED"}}

```

| 영역 | 이벤트 |
|---|---|
| 파티 | party.member_joined, party.member_left, party.member_updated, party.stage_changed, party.canceled |
| 후보 작업 | candidates.generation_succeeded, candidates.generation_failed |
| 카테고리 | category.viewed, category.eliminated, category.restored, category.review_completed, category.review_reopened |
| 식당 | restaurant.viewed, restaurant.eliminated, restaurant.restored, restaurant.review_completed, restaurant.review_reopened, restaurant.selected |
| 검토 | review.reset |
| 연결·주문 | store.connected, order.item_changed, order.member_completed, order.member_reopened, order.draft_updated, order.submitted, order.confirmed, order.rejected, order.canceled |
| 개인 세션 | session.expired |

`category.viewed`와 `restaurant.viewed`는 본인에게만 보낸다. 소거·복구 이벤트는 사용자 ID, 이름, 개별 제한, 소거 인원수, `eliminatedByMe`를 포함하지 않는 공통 payload를 사용한다. 본인 여부는 본인의 HTTP 응답 또는 후보 재조회로 반영한다. 완료 이벤트에는 공개 가능한 멤버 ID를 포함할 수 있지만 소거자와 연결하지 않는다. 소수 인원에서 행동 순서로 추정할 수 있다는 점까지 기술적으로 막는다고 보장하지 않는다.

전송은 최소 한 번 전달 방식이다. 클라이언트는 `eventId`로 중복 제거하고 스트림별 순서를 사용한다. reconnect 시 `Last-Event-ID`를 전달한다. 서버 보관 구간 안이면 재전송하며, 구간 밖이면 HTTP 연결 전에 `409 EVENT_CURSOR_EXPIRED`를 반환한다. 먼저 새 스트림을 연결하고 수신 이벤트를 임시 보관한 상태에서 파티·단계별 후보 목록·진행도·현재 주문을 GET으로 재조회한다. 조회 후 보관 이벤트를 반영하고, 모호한 순서나 버전 차이가 있으면 관련 리소스를 다시 조회한다. 이 방식으로 재조회와 재연결 사이의 변경 누락을 막는다. 상태 GET은 SSE 전달 순서와 관계없이 최종 정답이다.

## 8. 분석·보안 데이터 계약

분석 이벤트는 후보 노출·본인 소거·복구·단계 확정 시 생존·최종 선택·메뉴 열람·메뉴 선택·주문 제출·주문 확인을 별도로 저장한다. 명령 성공과 서버 내부 이벤트가 기준이며 클라이언트에서 `ORDER_CONFIRMED` 같은 전환을 임의 제출하는 API는 제공하지 않는다.

이벤트 유형은 `CANDIDATE_EXPOSED`, `CANDIDATE_ELIMINATED`, `ELIMINATION_RESTORED`, `CATEGORY_SURVIVED`, `RESTAURANT_SURVIVED`, `RESTAURANT_SELECTED`, `MENU_VIEWED`, `MENU_SELECTED`, `ORDER_SUBMITTED`, `ORDER_CONFIRMED`다. 후보 상세 메뉴 조회와 주문 메뉴 목록 조회는 반환된 항목 단위 열람 근거로 사용할 수 있지만 화면에 실제 노출됐다고 동일시하지 않는다. 화면 노출은 view 명령으로 구분한다.

원본 작성자·제한 정보는 권한 검사 및 필터링 저장소에서만 사용한다. 분석 식별자는 공개 사용자 ID와 분리한다. 해시 ID만으로 익명화됐다고 간주하지 않는다. 사업자용 분석 결과에는 집계 결과만 제공하며 원본 이벤트·개인 제한을 반환하는 API는 없다. 소거하지 않았다는 사실을 선호로 계산하지 않는다.

토큰·초대/QR 비밀·개인 제한·요청 자유 문구를 기본 액세스 로그에 남기지 않는다. 주문 확정·거절·수수료 기록에는 처리 주체·요청 ID·시각·이전/다음 상태를 감사 기록으로 남긴다. 상세 보관·집계 최소 표본·동의 정책은 별도 출시 정책으로 확정한다.

## 9. 오류 규약

```json
{
  "error": {
    "code": "INVALID_PARTY_STATE",
    "message": "현재 단계에서는 식당을 선택할 수 없습니다.",
    "details": {
      "currentState": "CATEGORY_REVIEW",
      "allowedStates": ["RESTAURANT_FINALIZED"]
    },
    "requestId": "request_123"
  }
}
```

| HTTP | 코드 | 의미 |
|---|---|---|
| 400 | INVALID_CURSOR, INVALID_REQUEST | 파싱 불가·유효하지 않은 커서 |
| 401 | UNAUTHORIZED, TOKEN_EXPIRED | 인증 누락·만료 |
| 403 | FORBIDDEN, HOST_PERMISSION_REQUIRED | 역할 부족 |
| 404 | RESOURCE_NOT_FOUND, PARTY_NOT_FOUND, CANDIDATE_NOT_FOUND | 미존재 또는 접근 불가 |
| 410 | INVITE_EXPIRED, QR_EXPIRED, GUEST_SESSION_EXPIRED | 만료·폐기된 공개 진입 수단 |
| 409 | INVALID_PARTY_STATE, INVALID_ORDER_STATE | 상태 전이 불가 |
| 409 | PARTY_FULL, PARTY_MEMBERSHIP_LOCKED, HOST_CANNOT_LEAVE | 참여·탈퇴 조건 불충족 |
| 409 | RESTRICTION_CONFIRMATION_REQUIRED | 제한 미확인 또는 revision 변경 |
| 409 | REVIEW_NOT_COMPLETED, MEMBERS_REVIEW_INCOMPLETE, REVIEW_LOCKED | 검토 조건 불충족 |
| 409 | NO_ACTIVE_CANDIDATES, GENERATION_IN_PROGRESS | 후보 없음·생성 중 |
| 409 | RESTAURANT_NOT_SELECTED, QR_RESTAURANT_MISMATCH, STORE_ORDER_DISABLED | 연결·주문 불가 |
| 409 | ORDER_NOT_EDITABLE, MEMBER_SELECTION_INCOMPLETE, EMPTY_ORDER | 주문 수정·제출 불가 |
| 409 | MENU_UNAVAILABLE, DIETARY_RESTRICTION_CONFLICT, MENU_INFORMATION_INCOMPLETE | 메뉴 검증 실패 |
| 409 | ORDER_PRICE_CHANGED, ORDER_ALREADY_SUBMITTED, ORDER_ALREADY_CONFIRMED | 가격 재확인·중복 상태 전이 |
| 409 | IDEMPOTENCY_KEY_REUSED, REQUEST_IN_PROGRESS, EVENT_CURSOR_EXPIRED | 재전송·스트림 복구 필요 |
| 412 | VERSION_CONFLICT | If-Match 버전 충돌 |
| 422 | VALIDATION_ERROR | 필드·옵션·코드·범위 오류 |
| 428 | PRECONDITION_REQUIRED | If-Match 누락 |
| 429 | RATE_LIMITED | 요청 제한; Retry-After 제공 |
| 503 | SERVICE_UNAVAILABLE | 일시적 의존 서비스 장애 |

이미 다른 사람이 소거한 후보에 본인 소거를 추가하는 것은 정상이다. 따라서 초안의 `CANDIDATE_ALREADY_ELIMINATED`를 일반 소거 오류로 사용하지 않는다. 본인 소거만 접근하는 경로이므로 `ELIMINATION_OWNER_MISMATCH` 대신 권한·리소스 검증을 적용한다. 같은 멱등성 키의 주문 재전송은 기존 성공 응답을 반환하며 `ORDER_ALREADY_*`는 새 키로 허용되지 않는 전이를 시도할 때 사용한다.

## 10. 핵심 연동 순서

1. 사용자 `/auth/login`, `/parties` 호출 → 방장 멤버 포함 WAITING 파티 생성.
2. `/invite-links`로 초대 → 계정 사용자는 join, 비회원은 `/guest-sessions`로 입장.
3. 전원 본인 식사 제한 조회·수정 → 최신 revision으로 dietary-confirmation 호출.
4. 방장 category-candidates/generate → Job 완료 또는 SSE로 CATEGORY_REVIEW 확인.
5. 전원 모든 후보 view → 원하는 후보 elimination → review/complete.
6. 방장 category-review/finalize → restaurant-candidates/generate → 식당도 동일하게 검토.
7. 방장 restaurant-review/finalize → selected-restaurant 선택.
8. 매장 방문 후 QR 조회 → 방장 store-connection → ORDERING 및 단일 DRAFT 주문.
9. 각자 주문 메뉴 조회·my-items 수정 → 본인 complete.
10. 방장 주문 확인 후 submit → SUBMITTED. 이후 사용자 앱은 수정 UI를 닫는다.
11. 사업자가 confirm 또는 reject. confirm이면 주문·파티·수수료·outbox를 원자적으로 기록.
12. 참가자는 SSE 또는 GET으로 결과 확인. 화면에는 ‘식당 주문 수락 완료’를 표시한다.

## 11. 구현 인수 기준

- 두 참가자가 같은 후보를 소거하고 한 명이 취소해도 후보는 계속 ELIMINATED다.
- 마지막 후보가 소거되면 확정은 실패하고 본인의 복구 요청은 가능하다.
- 검토 완료와 소거가 경합해도 확정된 집합은 변경되지 않는다.
- 타인 제한·소거자 정보는 HTTP 응답과 공통 SSE payload에서 노출되지 않는다.
- 접속이 끊긴 참가자를 자동 완료하지 않는다. WAITING 이후 참가자 추가·제거를 막는다.
- 후보 생성 실패·0개 결과·취소 중 작업 완료 시 파티가 잘못된 다음 단계로 진행하지 않는다.
- 다른 매장 QR, 폐기 QR, 비활성 주문 매장은 연결이 실패한다.
- QR 일반 주문은 파티 없이 생성·메뉴 선택·제출·식당 확인까지 진행할 수 있다.
- 타인의 주문 항목 수정, 가격 조작, 메뉴와 무관한 옵션 선택을 거절한다.
- 제출 시 품절·가격 변경·제한 충돌을 다시 검증하며 새 금액을 조용히 제출하지 않는다.
- submit/confirm을 동일 키로 재시도해도 주문·수수료 근거가 중복 생성되지 않는다.
- confirm과 reject가 동시에 실행되면 하나만 성공한다. DB 커밋 후 SSE 실패는 주문 성공을 취소하지 않는다.
- 수수료 정책이 없어도 주문은 확정되고 금액 계산 전 PENDING 근거가 남는다.
- 메뉴 삭제·가격 변경 후에도 과거 주문의 메뉴명·가격 스냅샷을 조회할 수 있다.

## 12. 구현 전 남은 결정

임시 정책 표의 승인 외에 인증 공급자·콜백 주소, 카테고리/재료/제한 코드 목록, 매장 소유권 심사, 서비스 운영 도메인, 파티 정원, SSE 보관 기간, 수수료 계산 규칙과 게스트·감사 기록의 상세 보관 기간이 필요하다. 이 값들은 문서의 예시 도메인·예시 ID·예시 요율과 구분해 배포 설정 또는 정책 리소스로 관리한다.
