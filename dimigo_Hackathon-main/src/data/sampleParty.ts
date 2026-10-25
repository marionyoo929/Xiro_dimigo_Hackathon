import { foods } from './foods'
import type { PlaceLocation } from '../lib/kakaoMaps'
import { registeredCatalog } from './registeredCatalog'
import { normalizeRadiusMeters, registeredCategoryCandidates, type RegisteredFoodCandidate } from '../lib/registeredCatalog'

export interface PartySettings {
  name: string
  location: PlaceLocation
  radiusKm: number
  budgetMax: number
}

export interface Party {
  id: string
  name: string
  place: string
  location?: PlaceLocation
  radiusKm: number
  budgetMax: number
  candidates: { foodId: string; distanceKm: number; maxPrice: number }[]
  candidateSource?: 'demo' | 'registered'
  registeredCandidates?: RegisteredFoodCandidate[]
  candidateSetVersion?: number
  sample?: boolean
}

// Static candidates near the sample place. Live restaurant/location search is not connected.
export const sampleParty: Party = {
  id: 'sample-party-andong-01',
  name: '안동공원 점심 모임',
  place: '안동공원',
  radiusKm: 8,
  budgetMax: 25000,
  candidates: [
    { foodId: 'bibimbap', distanceKm: 1.2, maxPrice: 15000 },
    { foodId: 'tonkatsu', distanceKm: 2.1, maxPrice: 13000 },
    { foodId: 'noodles', distanceKm: 1.7, maxPrice: 8900 },
    { foodId: 'spicy', distanceKm: 3.4, maxPrice: 13900 },
    { foodId: 'stew', distanceKm: 2.6, maxPrice: 11000 },
    { foodId: 'sushi', distanceKm: 4.1, maxPrice: 20000 },
    { foodId: 'pasta', distanceKm: 3.7, maxPrice: 18000 },
    { foodId: 'burger', distanceKm: 1.9, maxPrice: 12000 },
    { foodId: 'rice', distanceKm: 2.3, maxPrice: 10000 },
    { foodId: 'pizza', distanceKm: 5.2, maxPrice: 25000 },
    { foodId: 'salad', distanceKm: 3.0, maxPrice: 13000 },
  ],
  candidateSetVersion: 2,
  candidateSource: 'demo',
  sample: true,
}

export function withRegisteredCandidates(party: Party): Party {
  const searchRadiusMeters = normalizeRadiusMeters(party.radiusKm * 1000)
  return {
    ...party, radiusKm: searchRadiusMeters / 1000, candidates: [], candidateSource: 'registered',
    registeredCandidates: party.location ? registeredCategoryCandidates(registeredCatalog, {
      location: party.location, searchRadiusMeters, budgetPerPerson: party.budgetMax,
    }) : [],
  }
}

export function partyFoods(party: Party) {
  // Only the explicit development sample route may show the legacy food fixture.
  if (party.sample) return party.candidates
    .filter(candidate => candidate.distanceKm <= party.radiusKm && candidate.maxPrice <= party.budgetMax)
    .map(candidate => foods.find(food => food.id === candidate.foodId))
    .filter((food): food is (typeof foods)[number] => Boolean(food))
  return party.candidateSource === 'registered' ? party.registeredCandidates || [] : []
}
