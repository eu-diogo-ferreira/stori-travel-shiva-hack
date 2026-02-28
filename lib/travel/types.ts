export type TripState =
  | 'DISCOVERY'
  | 'SELECTION'
  | 'PLANNING'
  | 'REFINEMENT'
  | 'FINALIZATION'

export type ItineraryItemType =
  | 'attraction'
  | 'restaurant'
  | 'hotel'
  | 'transport'
  | 'activity'
  | 'other'

export interface TripPreferences {
  origin?: string
  destination?: string
  startDate?: string
  endDate?: string
  budgetMin?: number
  budgetMax?: number
  currency?: string
  travelers?: number
  companionType?: 'solo' | 'couple' | 'family' | 'friends' | 'business'
  pace?: 'slow' | 'moderate' | 'fast'
  travelStyles?: string[]
  notes?: string
}

export interface TripSourceInput {
  url: string
  title?: string
  publisher?: string
  snippet?: string
}

export interface ItineraryItemInput {
  type: ItineraryItemType
  title: string
  description?: string
  location?: string
  durationMin?: number
  dayIndex: number
  position?: number
  source?: TripSourceInput
}

export interface ItineraryItemDraft {
  id: string
  dayIndex: number
  position: number
  type: ItineraryItemType
  title: string
  description?: string
  location?: string
  durationMin?: number
  source?: TripSourceInput
}

export interface ItineraryDayDraft {
  dayIndex: number
  date?: string
  items: ItineraryItemDraft[]
}

export interface TripDraft {
  tripState: TripState
  preferences: TripPreferences
  days: ItineraryDayDraft[]
}

export type TripAction =
  | { type: 'CREATE_DAY'; payload: { dayIndex: number; date?: string } }
  | { type: 'REMOVE_DAY'; payload: { dayIndex: number } }
  | { type: 'ADD_ITEM'; payload: { item: ItineraryItemInput } }
  | { type: 'REMOVE_ITEM'; payload: { itemId: string } }
  | {
      type: 'MOVE_ITEM'
      payload: { itemId: string; toDayIndex: number; toPosition?: number }
    }
  | {
      type: 'REORDER_ITEMS'
      payload: { dayIndex: number; orderedItemIds: string[] }
    }
  | {
      type: 'UPDATE_ITEM'
      payload: {
        itemId: string
        patch: Partial<
          Omit<ItineraryItemInput, 'dayIndex' | 'position' | 'source'>
        > & {
          source?: TripSourceInput
        }
      }
    }
  | {
      type: 'UPDATE_TRIP_PREFERENCES'
      payload: { patch: Partial<TripPreferences> }
    }
  | {
      type: 'UPDATE_DATES'
      payload: {
        startDate?: string
        endDate?: string
        dayDates?: Record<string, string>
      }
    }
  | {
      type: 'UPDATE_BUDGET'
      payload: { budgetMin?: number; budgetMax?: number; currency?: string }
    }
  | { type: 'SET_TRIP_STATE'; payload: { tripState: TripState } }

export interface TravelAssistantEnvelope {
  assistant_message: string
  trip_state_next: TripState
  actions: TripAction[]
  client_operation_id: string
}
