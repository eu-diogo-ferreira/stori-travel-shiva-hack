import { describe, expect, it } from 'vitest'

import { applyActionsToDraft } from '@/lib/actions/trip-actions'
import type { TripDraft } from '@/lib/travel/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createEmptyDraft(
  state: TripDraft['tripState'] = 'PLANNING'
): TripDraft {
  return { tripState: state, preferences: {}, days: [] }
}

function createBaseDraft(): TripDraft {
  return {
    tripState: 'PLANNING',
    preferences: {},
    days: [
      {
        dayIndex: 1,
        items: [
          {
            id: 'item-1',
            dayIndex: 1,
            position: 1,
            type: 'attraction',
            title: 'Item 1'
          },
          {
            id: 'item-2',
            dayIndex: 1,
            position: 2,
            type: 'restaurant',
            title: 'Item 2'
          }
        ]
      },
      {
        dayIndex: 2,
        items: [
          {
            id: 'item-3',
            dayIndex: 2,
            position: 1,
            type: 'hotel',
            title: 'Item 3'
          }
        ]
      }
    ]
  }
}

// ---------------------------------------------------------------------------
// CREATE_DAY
// ---------------------------------------------------------------------------

describe('CREATE_DAY', () => {
  it('creates a new day on empty draft', () => {
    const next = applyActionsToDraft(createEmptyDraft(), [
      { type: 'CREATE_DAY', payload: { dayIndex: 1 } }
    ])
    expect(next.days).toHaveLength(1)
    expect(next.days[0].dayIndex).toBe(1)
    expect(next.days[0].items).toEqual([])
  })

  it('creates day with optional date', () => {
    const next = applyActionsToDraft(createEmptyDraft(), [
      { type: 'CREATE_DAY', payload: { dayIndex: 1, date: '2026-05-01' } }
    ])
    expect(next.days[0].date).toBe('2026-05-01')
  })

  it('does not duplicate existing day', () => {
    const next = applyActionsToDraft(createBaseDraft(), [
      { type: 'CREATE_DAY', payload: { dayIndex: 1 } }
    ])
    expect(next.days.filter(d => d.dayIndex === 1)).toHaveLength(1)
  })

  it('creates multiple days in order', () => {
    const next = applyActionsToDraft(createEmptyDraft(), [
      { type: 'CREATE_DAY', payload: { dayIndex: 3 } },
      { type: 'CREATE_DAY', payload: { dayIndex: 1 } },
      { type: 'CREATE_DAY', payload: { dayIndex: 2 } }
    ])
    expect(next.days.map(d => d.dayIndex)).toEqual([1, 2, 3])
  })
})

// ---------------------------------------------------------------------------
// REMOVE_DAY
// ---------------------------------------------------------------------------

describe('REMOVE_DAY', () => {
  it('removes existing day', () => {
    const next = applyActionsToDraft(createBaseDraft(), [
      { type: 'REMOVE_DAY', payload: { dayIndex: 1 } }
    ])
    expect(next.days).toHaveLength(1)
    expect(next.days[0].dayIndex).toBe(2)
  })

  it('is no-op for non-existent day', () => {
    const draft = createBaseDraft()
    const next = applyActionsToDraft(draft, [
      { type: 'REMOVE_DAY', payload: { dayIndex: 99 } }
    ])
    expect(next.days).toHaveLength(draft.days.length)
  })
})

// ---------------------------------------------------------------------------
// ADD_ITEM
// ---------------------------------------------------------------------------

describe('ADD_ITEM', () => {
  it('adds item to existing day', () => {
    const next = applyActionsToDraft(createBaseDraft(), [
      {
        type: 'ADD_ITEM',
        payload: {
          item: {
            type: 'activity',
            title: 'New activity',
            dayIndex: 1,
            durationMin: 60
          }
        }
      }
    ])
    const day1 = next.days.find(d => d.dayIndex === 1)!
    expect(day1.items).toHaveLength(3)
    expect(day1.items[2].title).toBe('New activity')
    expect(day1.items[2].position).toBe(3)
  })

  it('creates day if it does not exist', () => {
    const next = applyActionsToDraft(createEmptyDraft(), [
      {
        type: 'ADD_ITEM',
        payload: {
          item: {
            type: 'hotel',
            title: 'Hotel Roma',
            dayIndex: 1
          }
        }
      }
    ])
    expect(next.days).toHaveLength(1)
    expect(next.days[0].items[0].title).toBe('Hotel Roma')
  })

  it('adds item with source', () => {
    const next = applyActionsToDraft(createEmptyDraft(), [
      {
        type: 'ADD_ITEM',
        payload: {
          item: {
            type: 'attraction',
            title: 'Coliseu',
            dayIndex: 1,
            source: {
              url: 'https://example.com',
              title: 'Guide to Rome'
            }
          }
        }
      }
    ])
    expect(next.days[0].items[0].source?.url).toBe('https://example.com')
  })
})

// ---------------------------------------------------------------------------
// REMOVE_ITEM
// ---------------------------------------------------------------------------

describe('REMOVE_ITEM', () => {
  it('removes existing item and normalizes positions', () => {
    const next = applyActionsToDraft(createBaseDraft(), [
      { type: 'REMOVE_ITEM', payload: { itemId: 'item-1' } }
    ])
    const day1 = next.days.find(d => d.dayIndex === 1)!
    expect(day1.items).toHaveLength(1)
    expect(day1.items[0].id).toBe('item-2')
    expect(day1.items[0].position).toBe(1)
  })

  it('is no-op for non-existent item', () => {
    const next = applyActionsToDraft(createBaseDraft(), [
      { type: 'REMOVE_ITEM', payload: { itemId: 'nonexistent' } }
    ])
    expect(next.days.find(d => d.dayIndex === 1)!.items).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// MOVE_ITEM
// ---------------------------------------------------------------------------

describe('MOVE_ITEM', () => {
  it('moves item between days keeping continuous positions', () => {
    const next = applyActionsToDraft(createBaseDraft(), [
      {
        type: 'MOVE_ITEM',
        payload: { itemId: 'item-2', toDayIndex: 2, toPosition: 1 }
      }
    ])

    const day1 = next.days.find(d => d.dayIndex === 1)!
    const day2 = next.days.find(d => d.dayIndex === 2)!

    expect(day1.items).toHaveLength(1)
    expect(day1.items[0].position).toBe(1)

    expect(day2.items).toHaveLength(2)
    expect(day2.items[0].id).toBe('item-2')
    expect(day2.items[0].position).toBe(1)
    expect(day2.items[1].id).toBe('item-3')
    expect(day2.items[1].position).toBe(2)
  })

  it('moves item to end when no position specified', () => {
    const next = applyActionsToDraft(createBaseDraft(), [
      {
        type: 'MOVE_ITEM',
        payload: { itemId: 'item-1', toDayIndex: 2 }
      }
    ])

    const day2 = next.days.find(d => d.dayIndex === 2)!
    expect(day2.items).toHaveLength(2)
    expect(day2.items[1].id).toBe('item-1')
  })

  it('creates target day if it does not exist', () => {
    const next = applyActionsToDraft(createBaseDraft(), [
      {
        type: 'MOVE_ITEM',
        payload: { itemId: 'item-1', toDayIndex: 5 }
      }
    ])
    const day5 = next.days.find(d => d.dayIndex === 5)!
    expect(day5.items).toHaveLength(1)
    expect(day5.items[0].id).toBe('item-1')
  })

  it('is no-op for non-existent item', () => {
    const draft = createBaseDraft()
    const next = applyActionsToDraft(draft, [
      {
        type: 'MOVE_ITEM',
        payload: { itemId: 'ghost', toDayIndex: 2 }
      }
    ])
    expect(next.days.find(d => d.dayIndex === 1)!.items).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// REORDER_ITEMS
// ---------------------------------------------------------------------------

describe('REORDER_ITEMS', () => {
  it('reorders items preserving IDs and normalizing positions', () => {
    const next = applyActionsToDraft(createBaseDraft(), [
      {
        type: 'REORDER_ITEMS',
        payload: { dayIndex: 1, orderedItemIds: ['item-2', 'item-1'] }
      }
    ])

    const day1 = next.days.find(d => d.dayIndex === 1)!
    expect(day1.items[0].id).toBe('item-2')
    expect(day1.items[0].position).toBe(1)
    expect(day1.items[1].id).toBe('item-1')
    expect(day1.items[1].position).toBe(2)
  })

  it('throws when IDs do not match', () => {
    expect(() =>
      applyActionsToDraft(createBaseDraft(), [
        {
          type: 'REORDER_ITEMS',
          payload: { dayIndex: 1, orderedItemIds: ['item-1', 'item-99'] }
        }
      ])
    ).toThrowError('orderedItemIds must match current items in the day')
  })

  it('throws when count differs', () => {
    expect(() =>
      applyActionsToDraft(createBaseDraft(), [
        {
          type: 'REORDER_ITEMS',
          payload: { dayIndex: 1, orderedItemIds: ['item-1'] }
        }
      ])
    ).toThrowError()
  })
})

// ---------------------------------------------------------------------------
// UPDATE_ITEM
// ---------------------------------------------------------------------------

describe('UPDATE_ITEM', () => {
  it('patches item title', () => {
    const next = applyActionsToDraft(createBaseDraft(), [
      {
        type: 'UPDATE_ITEM',
        payload: { itemId: 'item-1', patch: { title: 'Renamed' } }
      }
    ])
    const item = next.days.flatMap(d => d.items).find(i => i.id === 'item-1')!
    expect(item.title).toBe('Renamed')
  })

  it('patches item type and description', () => {
    const next = applyActionsToDraft(createBaseDraft(), [
      {
        type: 'UPDATE_ITEM',
        payload: {
          itemId: 'item-2',
          patch: { type: 'activity', description: 'Fun' }
        }
      }
    ])
    const item = next.days.flatMap(d => d.items).find(i => i.id === 'item-2')!
    expect(item.type).toBe('activity')
    expect(item.description).toBe('Fun')
  })

  it('is no-op for non-existent item', () => {
    const next = applyActionsToDraft(createBaseDraft(), [
      {
        type: 'UPDATE_ITEM',
        payload: { itemId: 'ghost', patch: { title: 'X' } }
      }
    ])
    expect(
      next.days.flatMap(d => d.items).find(i => i.title === 'X')
    ).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// UPDATE_TRIP_PREFERENCES
// ---------------------------------------------------------------------------

describe('UPDATE_TRIP_PREFERENCES', () => {
  it('merges preferences', () => {
    const next = applyActionsToDraft(createEmptyDraft(), [
      {
        type: 'UPDATE_TRIP_PREFERENCES',
        payload: {
          patch: {
            origin: 'São Paulo',
            destination: 'Roma',
            pace: 'moderate'
          }
        }
      }
    ])
    expect(next.preferences.origin).toBe('São Paulo')
    expect(next.preferences.destination).toBe('Roma')
    expect(next.preferences.pace).toBe('moderate')
  })

  it('does not overwrite unrelated fields', () => {
    const draft = createEmptyDraft()
    draft.preferences = { origin: 'SP', travelers: 2 }
    const next = applyActionsToDraft(draft, [
      {
        type: 'UPDATE_TRIP_PREFERENCES',
        payload: { patch: { destination: 'Roma' } }
      }
    ])
    expect(next.preferences.origin).toBe('SP')
    expect(next.preferences.travelers).toBe(2)
    expect(next.preferences.destination).toBe('Roma')
  })
})

// ---------------------------------------------------------------------------
// UPDATE_DATES
// ---------------------------------------------------------------------------

describe('UPDATE_DATES', () => {
  it('sets start and end dates on preferences', () => {
    const next = applyActionsToDraft(createEmptyDraft(), [
      {
        type: 'UPDATE_DATES',
        payload: { startDate: '2026-05-01', endDate: '2026-05-10' }
      }
    ])
    expect(next.preferences.startDate).toBe('2026-05-01')
    expect(next.preferences.endDate).toBe('2026-05-10')
  })

  it('sets day-level dates', () => {
    const next = applyActionsToDraft(createBaseDraft(), [
      {
        type: 'UPDATE_DATES',
        payload: { dayDates: { '1': '2026-05-01', '2': '2026-05-02' } }
      }
    ])
    expect(next.days.find(d => d.dayIndex === 1)!.date).toBe('2026-05-01')
    expect(next.days.find(d => d.dayIndex === 2)!.date).toBe('2026-05-02')
  })
})

// ---------------------------------------------------------------------------
// UPDATE_BUDGET
// ---------------------------------------------------------------------------

describe('UPDATE_BUDGET', () => {
  it('sets budget range and currency', () => {
    const next = applyActionsToDraft(createEmptyDraft(), [
      {
        type: 'UPDATE_BUDGET',
        payload: { budgetMin: 500, budgetMax: 3000, currency: 'EUR' }
      }
    ])
    expect(next.preferences.budgetMin).toBe(500)
    expect(next.preferences.budgetMax).toBe(3000)
    expect(next.preferences.currency).toBe('EUR')
  })

  it('partial update preserves existing fields', () => {
    const draft = createEmptyDraft()
    draft.preferences = { budgetMin: 100, budgetMax: 1000, currency: 'USD' }
    const next = applyActionsToDraft(draft, [
      { type: 'UPDATE_BUDGET', payload: { budgetMax: 2000 } }
    ])
    expect(next.preferences.budgetMin).toBe(100)
    expect(next.preferences.budgetMax).toBe(2000)
    expect(next.preferences.currency).toBe('USD')
  })
})

// ---------------------------------------------------------------------------
// SET_TRIP_STATE
// ---------------------------------------------------------------------------

describe('SET_TRIP_STATE', () => {
  it('applies valid transition', () => {
    const next = applyActionsToDraft(createEmptyDraft('PLANNING'), [
      { type: 'SET_TRIP_STATE', payload: { tripState: 'REFINEMENT' } }
    ])
    expect(next.tripState).toBe('REFINEMENT')
  })

  it('allows same-state transition', () => {
    const next = applyActionsToDraft(createEmptyDraft('PLANNING'), [
      { type: 'SET_TRIP_STATE', payload: { tripState: 'PLANNING' } }
    ])
    expect(next.tripState).toBe('PLANNING')
  })

  it('throws on invalid transition', () => {
    expect(() =>
      applyActionsToDraft(createEmptyDraft('DISCOVERY'), [
        { type: 'SET_TRIP_STATE', payload: { tripState: 'FINALIZATION' } }
      ])
    ).toThrowError('Invalid trip state transition')
  })
})

// ---------------------------------------------------------------------------
// tripStateNext parameter
// ---------------------------------------------------------------------------

describe('tripStateNext parameter', () => {
  it('applies state transition after actions', () => {
    const next = applyActionsToDraft(
      createEmptyDraft('PLANNING'),
      [],
      'REFINEMENT'
    )
    expect(next.tripState).toBe('REFINEMENT')
  })

  it('throws when tripStateNext is invalid transition', () => {
    expect(() =>
      applyActionsToDraft(createEmptyDraft('DISCOVERY'), [], 'FINALIZATION')
    ).toThrowError()
  })

  it('does not throw when tripStateNext equals current state', () => {
    const next = applyActionsToDraft(
      createEmptyDraft('PLANNING'),
      [],
      'PLANNING'
    )
    expect(next.tripState).toBe('PLANNING')
  })
})

// ---------------------------------------------------------------------------
// Complex multi-action sequences
// ---------------------------------------------------------------------------

describe('multi-action sequences', () => {
  it('creates day, adds items, reorders in one batch', () => {
    const next = applyActionsToDraft(createEmptyDraft(), [
      { type: 'CREATE_DAY', payload: { dayIndex: 1 } },
      {
        type: 'ADD_ITEM',
        payload: {
          item: { type: 'attraction', title: 'A', dayIndex: 1 }
        }
      },
      {
        type: 'ADD_ITEM',
        payload: {
          item: { type: 'restaurant', title: 'B', dayIndex: 1 }
        }
      }
    ])
    const day1 = next.days.find(d => d.dayIndex === 1)!
    expect(day1.items).toHaveLength(2)
    expect(day1.items[0].position).toBe(1)
    expect(day1.items[1].position).toBe(2)
  })

  it('does not mutate original draft', () => {
    const original = createBaseDraft()
    const originalJSON = JSON.stringify(original)
    applyActionsToDraft(original, [
      { type: 'REMOVE_DAY', payload: { dayIndex: 1 } }
    ])
    expect(JSON.stringify(original)).toBe(originalJSON)
  })
})
