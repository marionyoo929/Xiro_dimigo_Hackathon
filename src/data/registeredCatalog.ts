import { foods } from './foods'
import type { RegisteredCatalog, RegisteredMenu } from '../lib/registeredCatalog'

// Mock of records already saved through a merchant/admin registration page.
// Fictional stores and menu prices for UI demos; these are not actual partners.
// Replace this catalog at the data boundary when the backend becomes available.
export const registeredCatalog: RegisteredCatalog = {
  categories: foods.map(({ id, name, description, image }) => ({ id, name, description, image })),
  restaurants: [
    { id: 'demo-city-a', name: '시청 등록 식당 A (시연)', address: '서울 시청 인근 · 시연 위치', location: { latitude: 37.5676, longitude: 126.9787 } },
    { id: 'demo-city-b', name: '시청 등록 식당 B (시연)', address: '서울 시청 인근 · 시연 위치', location: { latitude: 37.5701, longitude: 126.9787 } },
    { id: 'demo-city-c', name: '시청 등록 식당 C (시연)', address: '서울 시청 인근 · 시연 위치', location: { latitude: 37.5740, longitude: 126.9787 } },
    { id: 'demo-wadong-a', name: '와동 등록 식당 A (시연)', address: '와동공원 인근 · 시연 위치', location: { latitude: 37.3416, longitude: 126.8253 } },
    { id: 'demo-wadong-b', name: '와동 등록 식당 B (시연)', address: '와동공원 인근 · 시연 위치', location: { latitude: 37.3444, longitude: 126.8253 } },
    { id: 'demo-wadong-c', name: '와동 등록 식당 C (시연)', address: '와동공원 인근 · 시연 위치', location: { latitude: 37.3482, longitude: 126.8253 } },
  ],
  menus: ['city', 'wadong'].flatMap(area => [
    { id: `demo-${area}-bibimbap`, restaurantId: `demo-${area}-a`, name: '돌솥비빔밥', description: '나물과 소고기를 담은 돌솥비빔밥', price: 12000, categoryId: 'bibimbap', salesStatus: 'AVAILABLE' },
    { id: `demo-${area}-noodles`, restaurantId: `demo-${area}-a`, name: '잔치국수', description: '멸치 육수 잔치국수', price: 8000, categoryId: 'noodles', salesStatus: 'AVAILABLE' },
    { id: `demo-${area}-tonkatsu`, restaurantId: `demo-${area}-b`, name: '등심 돈가스', description: '바삭한 등심 돈가스', price: 13000, categoryId: 'tonkatsu', salesStatus: 'AVAILABLE' },
    { id: `demo-${area}-bibimbap-b`, restaurantId: `demo-${area}-b`, name: '야채비빔밥', description: '계절 나물 비빔밥', price: 10000, categoryId: 'bibimbap', salesStatus: 'AVAILABLE' },
    { id: `demo-${area}-pasta`, restaurantId: `demo-${area}-c`, name: '바질 파스타', description: '바질 소스 파스타', price: 18000, categoryId: 'pasta', salesStatus: 'AVAILABLE' },
    { id: `demo-${area}-salad`, restaurantId: `demo-${area}-c`, name: '그린 샐러드', description: '신선한 채소 샐러드', price: 11000, categoryId: 'salad', salesStatus: 'AVAILABLE' },
    { id: `demo-${area}-soldout`, restaurantId: `demo-${area}-a`, name: '품절 초밥', description: '시연용 품절 메뉴', price: 15000, categoryId: 'sushi', salesStatus: 'SOLD_OUT' },
    { id: `demo-${area}-hidden`, restaurantId: `demo-${area}-a`, name: '숨긴 피자', description: '시연용 숨김 메뉴', price: 15000, categoryId: 'pizza', salesStatus: 'HIDDEN' },
  ] satisfies RegisteredMenu[]),
}
