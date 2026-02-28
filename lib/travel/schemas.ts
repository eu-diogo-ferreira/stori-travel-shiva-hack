import { z } from 'zod'

const tripStateSchema = z.enum([
  'DISCOVERY',
  'SELECTION',
  'PLANNING',
  'REFINEMENT',
  'FINALIZATION'
])

const itemTypeSchema = z.enum([
  'attraction',
  'restaurant',
  'hotel',
  'transport',
  'activity',
  'other'
])

export const tripSourceSchema = z.object({
  url: z.string().url(),
  title: z.string().max(255).optional(),
  publisher: z.string().max(255).optional(),
  snippet: z.string().max(5000).optional()
})

export const tripPreferencesPatchSchema = z.object({
  origin: z.string().max(255).optional(),
  destination: z.string().max(255).optional(),
  startDate: z.string().max(30).optional(),
  endDate: z.string().max(30).optional(),
  budgetMin: z.number().nonnegative().optional(),
  budgetMax: z.number().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  travelers: z.number().int().positive().max(50).optional(),
  companionType: z
    .enum(['solo', 'couple', 'family', 'friends', 'business'])
    .optional(),
  pace: z.enum(['slow', 'moderate', 'fast']).optional(),
  travelStyles: z.array(z.string().max(50)).max(20).optional(),
  notes: z.string().max(2000).optional()
})

export const itineraryItemInputSchema = z.object({
  type: itemTypeSchema,
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  location: z.string().max(255).optional(),
  durationMin: z.number().int().positive().max(1440).optional(),
  dayIndex: z.number().int().positive(),
  position: z.number().int().positive().optional(),
  source: tripSourceSchema.optional()
})

export const createDayActionSchema = z.object({
  type: z.literal('CREATE_DAY'),
  payload: z.object({
    dayIndex: z.number().int().positive(),
    date: z.string().optional()
  })
})

export const removeDayActionSchema = z.object({
  type: z.literal('REMOVE_DAY'),
  payload: z.object({
    dayIndex: z.number().int().positive()
  })
})

export const addItemActionSchema = z.object({
  type: z.literal('ADD_ITEM'),
  payload: z.object({
    item: itineraryItemInputSchema
  })
})

export const removeItemActionSchema = z.object({
  type: z.literal('REMOVE_ITEM'),
  payload: z.object({
    itemId: z.string().min(1)
  })
})

export const moveItemActionSchema = z.object({
  type: z.literal('MOVE_ITEM'),
  payload: z.object({
    itemId: z.string().min(1),
    toDayIndex: z.number().int().positive(),
    toPosition: z.number().int().positive().optional()
  })
})

export const reorderItemsActionSchema = z.object({
  type: z.literal('REORDER_ITEMS'),
  payload: z.object({
    dayIndex: z.number().int().positive(),
    orderedItemIds: z.array(z.string().min(1)).min(1)
  })
})

export const updateItemActionSchema = z.object({
  type: z.literal('UPDATE_ITEM'),
  payload: z.object({
    itemId: z.string().min(1),
    patch: z
      .object({
        type: itemTypeSchema.optional(),
        title: z.string().min(1).max(255).optional(),
        description: z.string().max(2000).optional(),
        location: z.string().max(255).optional(),
        durationMin: z.number().int().positive().max(1440).optional(),
        source: tripSourceSchema.optional()
      })
      .refine(value => Object.keys(value).length > 0, {
        message: 'patch must have at least one field'
      })
  })
})

export const updatePreferencesActionSchema = z.object({
  type: z.literal('UPDATE_TRIP_PREFERENCES'),
  payload: z.object({
    patch: tripPreferencesPatchSchema
  })
})

export const updateDatesActionSchema = z.object({
  type: z.literal('UPDATE_DATES'),
  payload: z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    dayDates: z.record(z.string(), z.string()).optional()
  })
})

export const updateBudgetActionSchema = z.object({
  type: z.literal('UPDATE_BUDGET'),
  payload: z
    .object({
      budgetMin: z.number().nonnegative().optional(),
      budgetMax: z.number().nonnegative().optional(),
      currency: z.string().length(3).optional()
    })
    .refine(
      v =>
        v.budgetMin === undefined ||
        v.budgetMax === undefined ||
        v.budgetMax >= v.budgetMin,
      { message: 'budgetMax must be >= budgetMin' }
    )
})

export const setTripStateActionSchema = z.object({
  type: z.literal('SET_TRIP_STATE'),
  payload: z.object({
    tripState: tripStateSchema
  })
})

export const tripActionSchema = z.discriminatedUnion('type', [
  createDayActionSchema,
  removeDayActionSchema,
  addItemActionSchema,
  removeItemActionSchema,
  moveItemActionSchema,
  reorderItemsActionSchema,
  updateItemActionSchema,
  updatePreferencesActionSchema,
  updateDatesActionSchema,
  updateBudgetActionSchema,
  setTripStateActionSchema
])

export const applyTripActionsRequestSchema = z.object({
  tripId: z.string().min(1),
  clientOperationId: z.string().min(8).max(191),
  assistantMessage: z.string().max(5000).optional(),
  tripStateNext: tripStateSchema.optional(),
  actions: z.array(tripActionSchema).min(1).max(200)
})

export const travelMessageRequestSchema = z.object({
  tripId: z.string().min(1).optional(),
  message: z.string().min(1).max(5000),
  clientOperationId: z.string().min(8).max(191).optional()
})

export const travelAssistantEnvelopeSchema = z.object({
  assistant_message: z.string().min(1),
  trip_state_next: tripStateSchema,
  actions: z.array(tripActionSchema),
  client_operation_id: z.string().min(8).max(191)
})

export const tripStateSchemaZod = tripStateSchema

export type TripActionInput = z.infer<typeof tripActionSchema>
export type ApplyTripActionsRequest = z.infer<
  typeof applyTripActionsRequestSchema
>
export type TravelMessageRequest = z.infer<typeof travelMessageRequestSchema>
