# 시로 API 기능 목록

시로는 여러 사람이 먹기 싫은 음식과 식당을 함께 제외해 식사 장소를 정하고, 매장에서 각자 선택한 메뉴를 하나의 주문으로 전달하는 서비스입니다.

기존 명세 초안을 기준으로 총 80개 API를 기능별로 정리했습니다. 모든 경로는 `/api/v1`을 사용합니다. 아래는 개발할 기능의 목록이며, 구현 완료 여부를 나타내지는 않습니다.

## 로그인·게스트 API

`POST /api/v1/auth/login`

사용자 인증을 확인하고 로그인 토큰을 발급합니다.

`POST /api/v1/auth/refresh`

갱신 토큰으로 새로운 로그인 토큰을 발급합니다.

`POST /api/v1/auth/logout`

로그인 세션을 종료하고 해당 세션의 토큰을 무효화합니다.

`GET /api/v1/me`

현재 로그인한 사용자 또는 게스트의 기본 정보를 반환합니다.

`POST /api/v1/guest-sessions`

초대 링크로 접속한 비회원에게 게스트 토큰을 발급하고 해당 파티에 입장시킵니다.

## 음식·재료 기준 정보 API

`GET /api/v1/food-categories`

서비스에서 사용하는 음식 카테고리 목록을 반환합니다.

`GET /api/v1/ingredients`

메뉴 등록과 식사 제한 확인에 사용하는 재료 목록을 반환합니다.

`GET /api/v1/restriction-targets`

알레르기, 종교, 채식 등 식사 제한으로 등록할 수 있는 대상과 코드를 반환합니다.

## 개인 식사 제한 API

`GET /api/v1/me/dietary-restrictions`

본인이 등록한 알레르기와 식사 제한 목록을 반환합니다.

`PUT /api/v1/me/dietary-restrictions`

본인의 식사 제한 목록 전체를 새 목록으로 교체합니다.

`POST /api/v1/me/dietary-restrictions`

본인의 식사 제한을 한 개 추가합니다.

`DELETE /api/v1/me/dietary-restrictions/{restrictionId}`

본인이 등록한 특정 식사 제한을 삭제합니다.

`PUT /api/v1/parties/{partyId}/members/me/dietary-confirmation`

파티에서 사용할 본인의 최신 식사 제한을 확인하거나 확인을 취소합니다.

## 파티 관리 API

`POST /api/v1/parties`

모임 이름, 위치, 검색 반경, 예산 등을 설정해 파티를 만들고 생성자를 방장으로 등록합니다.

`GET /api/v1/parties/{partyId}`

파티의 현재 단계, 참가자, 선택한 식당, 주문 정보 등을 반환합니다.

`PATCH /api/v1/parties/{partyId}`

방장이 대기 중인 파티의 위치, 검색 반경, 예산 등 모임 조건을 수정합니다.

`DELETE /api/v1/parties/{partyId}`

방장이 주문 제출 전 파티를 취소합니다.

`GET /api/v1/me/parties`

본인이 참여 중이거나 참여했던 파티 중 조회 권한이 있는 목록을 반환합니다.

## 초대·참가자 API

`POST /api/v1/parties/{partyId}/invite-links`

방장이 다른 사람을 파티에 초대할 수 있는 링크를 발급합니다.

`POST /api/v1/party-invites/{inviteToken}/join`

로그인한 사용자가 초대 링크를 통해 파티에 참여합니다.

`GET /api/v1/parties/{partyId}/members`

파티 참가자의 표시명, 방장 여부, 접속 상태, 검토 완료 상태를 반환합니다.

`DELETE /api/v1/parties/{partyId}/members/{memberId}`

대기 중인 파티에서 본인이 탈퇴하거나 방장이 다른 참가자를 내보냅니다. 방장은 제거할 수 없습니다.

`PATCH /api/v1/parties/{partyId}/members/me`

대기 중인 파티에서 본인의 표시명을 수정합니다.

## 음식 카테고리 후보·소거 API

`POST /api/v1/parties/{partyId}/category-candidates/generate`

방장이 주변 식당의 메뉴와 참가자들의 식사 제한을 바탕으로 음식 카테고리 후보 생성을 시작합니다.

`GET /api/v1/parties/{partyId}/category-candidates`

파티의 음식 카테고리 후보와 각 후보의 소거 여부, 본인 확인 여부를 반환합니다.

`GET /api/v1/parties/{partyId}/category-candidates/{candidateId}`

특정 음식 카테고리의 이름, 이미지, 주변 식당 수, 가격대 등을 반환합니다.

`POST /api/v1/parties/{partyId}/category-candidates/{candidateId}/view`

본인이 해당 음식 카테고리 카드를 화면에서 확인했음을 기록합니다.

`PUT /api/v1/parties/{partyId}/category-candidates/{candidateId}/elimination`

먹고 싶지 않은 음식 카테고리를 소거해 파티 전체 후보에서 제외합니다. 소거자의 신원은 다른 참가자에게 공개하지 않습니다.

`DELETE /api/v1/parties/{partyId}/category-candidates/{candidateId}/elimination`

본인이 만든 음식 카테고리 소거를 취소합니다. 다른 참가자의 소거가 남아 있으면 후보는 계속 제외됩니다.

`GET /api/v1/parties/{partyId}/category-review/progress`

본인이 확인한 음식 후보 수와 전체 참가자의 검토 완료 현황을 반환합니다.

`POST /api/v1/parties/{partyId}/category-review/complete`

전체 음식 카테고리 후보를 확인한 뒤 본인의 검토를 완료합니다.

`DELETE /api/v1/parties/{partyId}/category-review/complete`

음식 검토 단계가 확정되기 전에 본인의 검토 완료를 취소합니다.

`POST /api/v1/parties/{partyId}/category-review/finalize`

모든 참가자의 검토가 끝나면 방장이 남은 음식 카테고리를 확정하고 식당 후보를 생성할 수 있게 합니다.

## 식당 후보·소거·선택 API

`POST /api/v1/parties/{partyId}/restaurant-candidates/generate`

방장이 확정된 음식 카테고리를 판매하는 주변 식당의 후보 생성을 시작합니다.

`GET /api/v1/parties/{partyId}/restaurant-candidates`

식당 후보와 대표 메뉴, 거리, 소거 여부, 본인 확인 여부를 반환합니다.

`GET /api/v1/parties/{partyId}/restaurant-candidates/{candidateId}`

특정 식당 후보의 위치, 대표 메뉴, 해당하는 음식 카테고리 등 상세 정보를 반환합니다.

`GET /api/v1/parties/{partyId}/restaurant-candidates/{candidateId}/menus`

식당 카드를 펼쳤을 때 대표 메뉴 외의 판매 메뉴도 확인할 수 있도록 메뉴 목록을 반환합니다.

`POST /api/v1/parties/{partyId}/restaurant-candidates/{candidateId}/view`

본인이 해당 식당 카드를 화면에서 확인했음을 기록합니다.

`PUT /api/v1/parties/{partyId}/restaurant-candidates/{candidateId}/elimination`

가고 싶지 않은 식당을 소거해 파티 전체 후보에서 제외합니다. 소거자의 신원은 다른 참가자에게 공개하지 않습니다.

`DELETE /api/v1/parties/{partyId}/restaurant-candidates/{candidateId}/elimination`

본인이 만든 식당 소거를 취소합니다. 다른 참가자의 소거가 남아 있으면 후보는 계속 제외됩니다.

`GET /api/v1/parties/{partyId}/restaurant-review/progress`

본인이 확인한 식당 수와 전체 참가자의 검토 완료 현황을 반환합니다.

`POST /api/v1/parties/{partyId}/restaurant-review/complete`

전체 식당 후보를 확인한 뒤 본인의 검토를 완료합니다.

`DELETE /api/v1/parties/{partyId}/restaurant-review/complete`

식당 검토 단계가 확정되기 전에 본인의 검토 완료를 취소합니다.

`POST /api/v1/parties/{partyId}/restaurant-review/finalize`

모든 참가자의 검토가 끝나면 방장이 남은 식당 후보를 확정합니다.

`PUT /api/v1/parties/{partyId}/selected-restaurant`

방장이 소거되지 않은 식당 중 실제로 방문할 최종 식당을 선택합니다.

## 후보 생성 작업 조회 API

`GET /api/v1/jobs/{jobId}`

음식 카테고리 또는 식당 후보 생성 작업의 진행 상태, 완료 여부, 실패 이유를 반환합니다.

## QR·매장 연결 API

`GET /api/v1/store-qr/{qrToken}`

로그인 없이 QR에 연결된 식당의 이름과 주문 가능 여부를 확인합니다.

`POST /api/v1/parties/{partyId}/store-connection`

방장이 QR을 스캔해 선택한 식당과 파티를 연결하고 공동 주문 초안을 만듭니다.

`POST /api/v1/store-qr/{qrToken}/guest-order-sessions`

파티 없이 매장 QR로 접속한 비회원에게 게스트 토큰을 발급하고 일반 주문을 시작합니다.

## 메뉴 선택·공동 주문 API

`POST /api/v1/parties/{partyId}/orders`

매장 연결 시 만든 파티 주문 초안을 반환하거나 누락된 초안을 복구합니다. 같은 파티에 주문을 중복 생성하지 않습니다.

`GET /api/v1/parties/{partyId}/order`

파티에 연결된 현재 주문 내역과 주문 상태를 반환합니다.

`GET /api/v1/orders/{orderId}/menus`

해당 주문에서 선택할 수 있는 매장의 최신 메뉴, 가격, 옵션 목록을 반환합니다.

`POST /api/v1/orders/{orderId}/my-items`

본인이 먹을 메뉴, 수량, 옵션, 요청사항을 공동 주문에 추가합니다.

`PATCH /api/v1/orders/{orderId}/my-items/{orderItemId}`

본인이 추가한 메뉴의 수량, 옵션, 요청사항을 수정합니다.

`DELETE /api/v1/orders/{orderId}/my-items/{orderItemId}`

본인이 추가한 메뉴를 주문에서 삭제합니다.

`GET /api/v1/orders/{orderId}`

참가자별 선택 메뉴, 선택 완료 여부, 전체 금액과 주문 상태를 반환합니다.

`POST /api/v1/orders/{orderId}/members/me/complete`

본인의 메뉴 선택을 완료하고 다른 참가자에게 완료 상태를 알립니다.

`DELETE /api/v1/orders/{orderId}/members/me/complete`

주문 제출 전에 본인의 메뉴 선택 완료를 취소해 메뉴를 다시 수정할 수 있게 합니다.

`POST /api/v1/orders/{orderId}/submit`

파티에서는 전원 메뉴 선택 완료 후 방장이 주문을 식당에 제출합니다. 일반 QR 주문에서는 주문자 본인이 제출합니다.

## 사장님 매장 관리 API

`POST /api/v1/merchant/restaurants`

사업자가 본인의 매장 이름, 주소, 위치, 영업시간, 연락처 등을 등록합니다.

`GET /api/v1/merchant/restaurants`

로그인한 사업자가 소유한 매장 목록을 반환합니다.

`GET /api/v1/merchant/restaurants/{restaurantId}`

사업자 본인 매장의 상세 정보와 주문 접수 가능 여부를 반환합니다.

`PATCH /api/v1/merchant/restaurants/{restaurantId}`

사업자가 본인 매장의 정보, 영업시간, 주문 접수 가능 여부를 수정합니다.

## 사장님 메뉴 관리 API

`POST /api/v1/merchant/restaurants/{restaurantId}/menus`

매장의 메뉴, 가격, 음식 카테고리, 재료, 알레르기 정보, 선택 옵션 등을 등록합니다.

`GET /api/v1/merchant/restaurants/{restaurantId}/menus`

사업자 본인 매장에 등록된 메뉴 목록을 반환합니다.

`GET /api/v1/merchant/menus/{menuId}`

특정 메뉴의 가격, 재료, 옵션, 판매 상태 등 상세 정보를 반환합니다.

`PATCH /api/v1/merchant/menus/{menuId}`

메뉴 정보, 가격, 옵션, 대표 메뉴 여부, 품절 등 판매 상태를 수정합니다.

`DELETE /api/v1/merchant/menus/{menuId}`

메뉴를 삭제 처리해 새 주문에서 제외합니다. 기존 주문에 기록된 메뉴 정보는 유지합니다.

## 사장님 QR 관리 API

`POST /api/v1/merchant/restaurants/{restaurantId}/qr-codes`

손님이 매장 정보와 주문 화면에 접근할 수 있는 QR 링크를 발급합니다.

`GET /api/v1/merchant/restaurants/{restaurantId}/qr-codes`

본인 매장에 발급된 QR 목록과 활성 여부를 반환합니다.

`DELETE /api/v1/merchant/restaurants/{restaurantId}/qr-codes/{qrCodeId}`

특정 QR을 폐기해 새로운 매장 연결과 주문 시작을 차단합니다.

## 사장님 주문 처리 API

`GET /api/v1/merchant/orders`

사업자 본인 매장에 제출된 주문 목록을 매장, 상태, 기간별로 조회합니다.

`GET /api/v1/merchant/orders/{orderId}`

매장에 들어온 특정 주문의 메뉴, 수량, 옵션, 요청사항과 전체 금액을 반환합니다.

`POST /api/v1/merchant/orders/{orderId}/confirm`

식당이 주문 전체를 수락합니다. 주문 수락 시각을 기록하고 수수료 청구 근거를 생성합니다.

`POST /api/v1/merchant/orders/{orderId}/reject`

품절, 영업 종료 등의 이유로 주문 전체를 거절하고 참가자에게 이유를 전달합니다.

## 사장님 수수료 조회 API

`GET /api/v1/merchant/commissions`

본인 매장의 수수료 근거 목록을 매장, 상태, 기간별로 조회합니다.

`GET /api/v1/merchant/commissions/{commissionId}`

특정 주문의 수수료 산정 기준, 주문 금액, 적용 정책과 수수료 상태를 반환합니다. 요율이 미정이면 계산 대기 상태로 표시합니다.

## 실시간 알림 API

`GET /api/v1/parties/{partyId}/events`

참가자 입장·퇴장, 후보 소거·복구, 검토 완료, 단계 변경 등 파티 이벤트를 실시간으로 전달합니다.

`GET /api/v1/orders/{orderId}/events`

메뉴 변경, 선택 완료, 주문 제출, 식당 수락·거절 등 해당 주문의 변경 사항을 실시간으로 전달합니다.

`GET /api/v1/merchant/restaurants/{restaurantId}/events`

새 주문 제출과 주문 상태 변경 등 본인 매장의 이벤트를 사장님 웹에 실시간으로 전달합니다.

## 서비스 공통 사항

공개 접근은 로그인·게스트 발급·QR 정보 조회처럼 명시된 API에만 허용합니다. 파티 정보는 참가자만, 매장 관리 정보는 해당 매장의 사업자만 확인할 수 있습니다.

다른 참가자의 개인 식사 제한과 소거자의 신원은 공개하지 않습니다. 주문 제출 후에는 참가자가 메뉴를 수정할 수 없습니다.

서비스 내부 결제 기능은 포함하지 않습니다. 식당의 주문 수락은 결제 완료나 조리 완료를 뜻하지 않으며, 수수료 청구 근거를 만드는 기준입니다.

방장만 주문 제출, 전체 주문 수락·거절, 수수료 계산 방식 등 세부 운영 정책은 기존 명세의 임시 정책을 따릅니다.
