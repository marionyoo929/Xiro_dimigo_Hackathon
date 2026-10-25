// All prices are demo examples, independent of party votes.
export const foods = [
  { id: 'bibimbap', name: '돌솥비빔밥', description: '쌀밥 나물4종 비빔소스', detail: '따뜻한 돌솥에 담은 맛있는 비빔밥입니다', price: '12,000원~15,000원', image: 'bibimbap.png' },
  { id: 'tonkatsu', name: '돈가스', description: '돼지고기 돈가스 소스 양배추', detail: '바삭하게 튀겨낸 돈가스의 정석', price: '9,600원~13,000원', image: 'tonkatsu.png' },
  { id: 'noodles', name: '잔치국수', description: '멸치국물 소면 대파', detail: '후루룩 넘기는 음식 1위', price: '7,600원~8,900원', image: 'noodles.png' },
  { id: 'spicy', name: '아부라소바', description: '소바 차슈 계란', detail: '추위를 뚫어주는 음식', price: '9,800원~13,900원', image: 'spicy.png' },
  { id: 'stew', name: '김치찌개', description: '잘 익은 김치와 돼지고기', detail: '얼큰하고 든든한 한 끼', price: '8,000원~11,000원', image: 'kimchi_stew.webp' },
  { id: 'sushi', name: '초밥', description: '신선한 생선과 초대리 밥', detail: '한입에 즐기는 산뜻한 맛', price: '12,000원~20,000원', image: 'sushi.jpg' },
  { id: 'pasta', name: '파스타', description: '바질 소스와 쫄깃한 면', detail: '향긋한 소스로 즐기는 한 접시', price: '11,000원~18,000원', image: 'Pasta.jpg' },
  { id: 'burger', name: '햄버거', description: '소고기 패티와 신선한 채소', detail: '간편하게 즐기는 든든한 맛', price: '7,000원~12,000원', image: 'hamburger.png' },
  { id: 'rice', name: '볶음밥', description: '고슬고슬한 밥과 달걀', detail: '함께 볶아낸 한 그릇', price: '7,000원~10,000원', image: 'fried_rice.jpg' },
  { id: 'pizza', name: '피자', description: '치즈와 토마토 소스', detail: '함께 나눠 먹기 좋은 메뉴', price: '15,000원~25,000원', image: 'pizza.jpg' },
  { id: 'salad', name: '샐러드', description: '싱싱한 채소와 방울토마토', detail: '가볍고 산뜻한 한 끼', price: '8,000원~13,000원', image: 'salad.jpg' },
] satisfies { id: string; name: string; description: string; detail: string; price: string; image: string }[]
