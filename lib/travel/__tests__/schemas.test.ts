import { describe, expect, it } from 'vitest'

import {
  applyTripActionsRequestSchema,
  travelAssistantEnvelopeSchema,
  travelMessageRequestSchema,
  tripActionSchema,
  tripPreferencesPatchSchema,
  updateBudgetActionSchema
} from '@/lib/travel/schemas'

// ---------------------------------------------------------------------------
// Individual action schemas
// ---------------------------------------------------------------------------

describe('tripActionSchema', () => {
  it('accepts valid CREATE_DAY', () => {
    const result = tripActionSchema.safeParse({
      type: 'CREATE_DAY',
      payload: { dayIndex: 1 }
    })
    expect(result.success).toBe(true)
  })

  it('accepts CREATE_DAY with optional date', () => {
    const result = tripActionSchema.safeParse({
      type: 'CREATE_DAY',
      payload: { dayIndex: 2, date: '2026-04-15' }
    })
    expect(result.success).toBe(true)
  })

  it('rejects CREATE_DAY with dayIndex <= 0', () => {
    const result = tripActionSchema.safeParse({
      type: 'CREATE_DAY',
      payload: { dayIndex: 0 }
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid ADD_ITEM', () => {
    const result = tripActionSchema.safeParse({
      type: 'ADD_ITEM',
      payload: {
        item: {
          type: 'attraction',
          title: 'Coliseu',
          dayIndex: 1,
          durationMin: 120
        }
      }
    })
    expect(result.success).toBe(true)
  })

  it('rejects ADD_ITEM with empty title', () => {
    const result = tripActionSchema.safeParse({
      type: 'ADD_ITEM',
      payload: {
        item: {
          type: 'attraction',
          title: '',
          dayIndex: 1
        }
      }
    })
    expect(result.success).toBe(false)
  })

  it('rejects ADD_ITEM with invalid item type', () => {
    const result = tripActionSchema.safeParse({
      type: 'ADD_ITEM',
      payload: {
        item: {
          type: 'spa',
          title: 'Spa day',
          dayIndex: 1
        }
      }
    })
    expect(result.success).toBe(false)
  })

  it('rejects ADD_ITEM with durationMin > 1440', () => {
    const result = tripActionSchema.safeParse({
      type: 'ADD_ITEM',
      payload: {
        item: {
          type: 'activity',
          title: 'Long day',
          dayIndex: 1,
          durationMin: 1441
        }
      }
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid REMOVE_ITEM', () => {
    const result = tripActionSchema.safeParse({
      type: 'REMOVE_ITEM',
      payload: { itemId: 'abc123' }
    })
    expect(result.success).toBe(true)
  })

  it('rejects REMOVE_ITEM with empty itemId', () => {
    const result = tripActionSchema.safeParse({
      type: 'REMOVE_ITEM',
      payload: { itemId: '' }
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid MOVE_ITEM', () => {
    const result = tripActionSchema.safeParse({
      type: 'MOVE_ITEM',
      payload: { itemId: 'item-1', toDayIndex: 2, toPosition: 3 }
    })
    expect(result.success).toBe(true)
  })

  it('accepts valid REORDER_ITEMS', () => {
    const result = tripActionSchema.safeParse({
      type: 'REORDER_ITEMS',
      payload: { dayIndex: 1, orderedItemIds: ['a', 'b', 'c'] }
    })
    expect(result.success).toBe(true)
  })

  it('rejects REORDER_ITEMS with empty orderedItemIds', () => {
    const result = tripActionSchema.safeParse({
      type: 'REORDER_ITEMS',
      payload: { dayIndex: 1, orderedItemIds: [] }
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid UPDATE_ITEM with at least one patch field', () => {
    const result = tripActionSchema.safeParse({
      type: 'UPDATE_ITEM',
      payload: { itemId: 'x', patch: { title: 'New title' } }
    })
    expect(result.success).toBe(true)
  })

  it('rejects UPDATE_ITEM with empty patch', () => {
    const result = tripActionSchema.safeParse({
      type: 'UPDATE_ITEM',
      payload: { itemId: 'x', patch: {} }
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid SET_TRIP_STATE', () => {
    const result = tripActionSchema.safeParse({
      type: 'SET_TRIP_STATE',
      payload: { tripState: 'PLANNING' }
    })
    expect(result.success).toBe(true)
  })

  it('rejects SET_TRIP_STATE with invalid state', () => {
    const result = tripActionSchema.safeParse({
      type: 'SET_TRIP_STATE',
      payload: { tripState: 'INVALID' }
    })
    expect(result.success).toBe(false)
  })

  it('rejects unknown action type', () => {
    const result = tripActionSchema.safeParse({
      type: 'DESTROY_ALL',
      payload: {}
    })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Budget validation refinement
// ---------------------------------------------------------------------------

describe('updateBudgetActionSchema', () => {
  it('accepts valid budget range', () => {
    const result = updateBudgetActionSchema.safeParse({
      type: 'UPDATE_BUDGET',
      payload: { budgetMin: 100, budgetMax: 5000, currency: 'USD' }
    })
    expect(result.success).toBe(true)
  })

  it('rejects budgetMax < budgetMin', () => {
    const result = updateBudgetActionSchema.safeParse({
      type: 'UPDATE_BUDGET',
      payload: { budgetMin: 5000, budgetMax: 100 }
    })
    expect(result.success).toBe(false)
  })

  it('allows only one side of budget', () => {
    const result = updateBudgetActionSchema.safeParse({
      type: 'UPDATE_BUDGET',
      payload: { budgetMin: 500 }
    })
    expect(result.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Preferences patch
// ---------------------------------------------------------------------------

describe('tripPreferencesPatchSchema', () => {
  it('accepts complete preferences', () => {
    const result = tripPreferencesPatchSchema.safeParse({
      origin: 'São Paulo',
      destination: 'Roma',
      startDate: '2026-05-01',
      endDate: '2026-05-10',
      budgetMin: 500,
      budgetMax: 3000,
      currency: 'EUR',
      travelers: 2,
      companionType: 'couple',
      pace: 'moderate',
      travelStyles: ['cultural', 'gastronomic'],
      notes: 'Primeira viagem à Europa'
    })
    expect(result.success).toBe(true)
  })

  it('accepts empty object', () => {
    const result = tripPreferencesPatchSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('rejects currency with wrong length', () => {
    const result = tripPreferencesPatchSchema.safeParse({
      currency: 'US'
    })
    expect(result.success).toBe(false)
  })

  it('rejects travelers > 50', () => {
    const result = tripPreferencesPatchSchema.safeParse({
      travelers: 51
    })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Envelope schemas
// ---------------------------------------------------------------------------

describe('applyTripActionsRequestSchema', () => {
  it('validates complete request', () => {
    const result = applyTripActionsRequestSchema.safeParse({
      tripId: 'trip_123',
      clientOperationId: 'client_op_12345',
      actions: [{ type: 'CREATE_DAY', payload: { dayIndex: 1 } }]
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty actions array', () => {
    const result = applyTripActionsRequestSchema.safeParse({
      tripId: 'trip_123',
      clientOperationId: 'client_op_12345',
      actions: []
    })
    expect(result.success).toBe(false)
  })

  it('rejects short clientOperationId', () => {
    const result = applyTripActionsRequestSchema.safeParse({
      tripId: 'trip_123',
      clientOperationId: 'short',
      actions: [{ type: 'CREATE_DAY', payload: { dayIndex: 1 } }]
    })
    expect(result.success).toBe(false)
  })

  it('accepts optional assistantMessage and tripStateNext', () => {
    const result = applyTripActionsRequestSchema.safeParse({
      tripId: 'trip_123',
      clientOperationId: 'client_op_12345',
      assistantMessage: 'Added day 1',
      tripStateNext: 'PLANNING',
      actions: [{ type: 'CREATE_DAY', payload: { dayIndex: 1 } }]
    })
    expect(result.success).toBe(true)
  })
})

describe('travelAssistantEnvelopeSchema', () => {
  it('validates full assistant envelope', () => {
    const result = travelAssistantEnvelopeSchema.safeParse({
      assistant_message: 'Sugeri um roteiro inicial.',
      trip_state_next: 'PLANNING',
      client_operation_id: 'client_operation_001',
      actions: [
        { type: 'CREATE_DAY', payload: { dayIndex: 1 } },
        {
          type: 'ADD_ITEM',
          payload: {
            item: {
              type: 'attraction',
              title: 'Coliseu',
              dayIndex: 1,
              durationMin: 120
            }
          }
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty assistant_message', () => {
    const result = travelAssistantEnvelopeSchema.safeParse({
      assistant_message: '',
      trip_state_next: 'PLANNING',
      client_operation_id: 'client_operation_001',
      actions: []
    })
    expect(result.success).toBe(false)
  })
})

describe('travelMessageRequestSchema', () => {
  it('accepts minimal message', () => {
    const result = travelMessageRequestSchema.safeParse({
      message: 'Quero viajar para Roma'
    })
    expect(result.success).toBe(true)
  })

  it('accepts message with tripId', () => {
    const result = travelMessageRequestSchema.safeParse({
      tripId: 'trip_x',
      message: 'Adicione um dia a mais',
      clientOperationId: 'op_12345678'
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty message', () => {
    const result = travelMessageRequestSchema.safeParse({
      message: ''
    })
    expect(result.success).toBe(false)
  })
})
