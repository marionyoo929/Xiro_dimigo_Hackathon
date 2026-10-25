export type CustomerProfile = { age: number; gender: 'FEMALE' | 'MALE' | 'OTHER' | 'UNDISCLOSED'; updatedAt: string }
export type ProfileResponse = { profile: CustomerProfile | null }
export type StoreStats = {
  restaurantId: string; days: number; from: string; toExclusive: string; timeZone: string; generatedAt: string
  summary: { orders: number; pendingOrders: number; confirmedOrders: number; rejectedOrders: number; canceledOrders: number; confirmedAmount: number; averageConfirmedAmount: number; participants: number }
  daily: { date: string; orders: number; confirmedOrders: number; confirmedAmount: number }[]
  popularMenus: { menuId: string; name: string; quantity: number; amount: number }[]
  ageGroups: { label: string; count: number }[]; genders: { label: string; count: number }[]
  market: {
    popularCategories: { categoryId: string | null; name: string; quantity: number; orderCount: number }[]
    categoryInsights: {
      ownCategories: { categoryId: string; name: string }[]; finalizedReviews: number; excludedReviews: number
      excludedOwnCategories: { categoryId: string; name: string; partyCount: number }[]
      survivingAlternatives: { categoryId: string; name: string; partyCount: number; sharePercent: number }[]
    }
  }
}
