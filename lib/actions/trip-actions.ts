import { and, desc, eq, inArray } from 'drizzle-orm'

import {
  getDefaultTripState,
  isValidTripStateTransition
} from '@/lib/travel/state-machine'
import type {
  TripAction,
  TripDraft,
  TripPreferences,
  TripSourceInput
} from '@/lib/travel/types'

import {
  generateId,
  itineraryDays,
  itineraryItems,
  itineraryVersions,
  tripActionLogs,
  trips,
  tripSources
} from '../db/schema'
import type { TxInstance } from '../db/with-rls'
import { withRLS } from '../db/with-rls'

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface ApplyTripActionsInput {
  userId: string
  tripId: string
  clientOperationId: string
  actions: TripAction[]
  assistantMessage?: string
  tripStateNext?: TripDraft['tripState']
}

export interface TripSnapshot {
  tripId: string
  version: number
  tripState: TripDraft['tripState']
  preferences: TripPreferences
  days: Array<{
    dayIndex: number
    date?: string
    items: Array<{
      id: string
      type: string
      title: string
      description?: string
      location?: string
      durationMin?: number
      position: number
      source?: TripSourceInput
    }>
  }>
}

// ---------------------------------------------------------------------------
// Draft helpers (pure – no DB access)
// ---------------------------------------------------------------------------

function ensureDay(draft: TripDraft, dayIndex: number) {
  let day = draft.days.find(d => d.dayIndex === dayIndex)
  if (!day) {
    day = { dayIndex, items: [] }
    draft.days.push(day)
  }
  return day
}

/**
 * Normalise draft: sort days by index and re-assign item positions
 * sequentially (1..N) based on **current array order**.
 *
 * Important: we intentionally do NOT sort items by their old `position`
 * field. Operations like MOVE_ITEM (splice) and REORDER_ITEMS set the
 * array order explicitly — re-sorting by position would undo those.
 */
function normalizeDraft(draft: TripDraft) {
  draft.days.sort((a, b) => a.dayIndex - b.dayIndex)
  for (const day of draft.days) {
    day.items.forEach((item, idx) => {
      item.position = idx + 1
    })
  }
}

function removeItemById(draft: TripDraft, itemId: string) {
  for (const day of draft.days) {
    const idx = day.items.findIndex(item => item.id === itemId)
    if (idx >= 0) {
      day.items.splice(idx, 1)
      return true
    }
  }
  return false
}

function findItem(draft: TripDraft, itemId: string) {
  for (const day of draft.days) {
    const item = day.items.find(candidate => candidate.id === itemId)
    if (item) return { day, item }
  }
  return null
}

// ---------------------------------------------------------------------------
// applyActionsToDraft – exported for unit testing
// ---------------------------------------------------------------------------

export function applyActionsToDraft(
  initialDraft: TripDraft,
  actions: TripAction[],
  tripStateNext?: TripDraft['tripState']
): TripDraft {
  const draft: TripDraft = JSON.parse(JSON.stringify(initialDraft))

  for (const action of actions) {
    switch (action.type) {
      case 'CREATE_DAY': {
        const day = ensureDay(draft, action.payload.dayIndex)
        if (action.payload.date) day.date = action.payload.date
        break
      }
      case 'REMOVE_DAY': {
        draft.days = draft.days.filter(
          day => day.dayIndex !== action.payload.dayIndex
        )
        break
      }
      case 'ADD_ITEM': {
        const day = ensureDay(draft, action.payload.item.dayIndex)
        const specifiedPos = action.payload.item.position
        const newItem = {
          id: generateId(),
          dayIndex: action.payload.item.dayIndex,
          position: specifiedPos ?? day.items.length + 1,
          type: action.payload.item.type,
          title: action.payload.item.title,
          description: action.payload.item.description,
          location: action.payload.item.location,
          durationMin: action.payload.item.durationMin,
          source: action.payload.item.source
        }
        if (specifiedPos && specifiedPos <= day.items.length) {
          // Insert at the specified position (1-based → 0-based index)
          day.items.splice(specifiedPos - 1, 0, newItem)
        } else {
          day.items.push(newItem)
        }
        break
      }
      case 'REMOVE_ITEM': {
        removeItemById(draft, action.payload.itemId)
        break
      }
      case 'MOVE_ITEM': {
        const found = findItem(draft, action.payload.itemId)
        if (!found) break
        const movedItem = { ...found.item }
        removeItemById(draft, action.payload.itemId)
        const targetDay = ensureDay(draft, action.payload.toDayIndex)
        const targetIndex =
          action.payload.toPosition && action.payload.toPosition > 0
            ? action.payload.toPosition - 1
            : targetDay.items.length
        targetDay.items.splice(
          Math.min(targetIndex, targetDay.items.length),
          0,
          { ...movedItem, dayIndex: action.payload.toDayIndex }
        )
        break
      }
      case 'REORDER_ITEMS': {
        const day = ensureDay(draft, action.payload.dayIndex)
        const currentIds = day.items.map(item => item.id).sort()
        const targetIds = [...action.payload.orderedItemIds].sort()
        if (JSON.stringify(currentIds) !== JSON.stringify(targetIds)) {
          throw new Error('orderedItemIds must match current items in the day')
        }
        const idToItem = new Map(day.items.map(item => [item.id, item]))
        day.items = action.payload.orderedItemIds.map(id => {
          const existing = idToItem.get(id)
          if (!existing) {
            throw new Error(`Item ${id} not found during reorder`)
          }
          return existing
        })
        break
      }
      case 'UPDATE_ITEM': {
        const found = findItem(draft, action.payload.itemId)
        if (!found) break
        const { patch } = action.payload
        found.item.type = patch.type ?? found.item.type
        found.item.title = patch.title ?? found.item.title
        found.item.description = patch.description ?? found.item.description
        found.item.location = patch.location ?? found.item.location
        found.item.durationMin = patch.durationMin ?? found.item.durationMin
        found.item.source = patch.source ?? found.item.source
        break
      }
      case 'UPDATE_TRIP_PREFERENCES': {
        draft.preferences = {
          ...draft.preferences,
          ...action.payload.patch
        }
        break
      }
      case 'UPDATE_DATES': {
        if (action.payload.startDate)
          draft.preferences.startDate = action.payload.startDate
        if (action.payload.endDate)
          draft.preferences.endDate = action.payload.endDate
        if (action.payload.dayDates) {
          for (const [dayKey, dayDate] of Object.entries(
            action.payload.dayDates
          )) {
            const dayIndex = Number(dayKey)
            if (Number.isNaN(dayIndex)) continue
            ensureDay(draft, dayIndex).date = dayDate
          }
        }
        break
      }
      case 'UPDATE_BUDGET': {
        if (action.payload.budgetMin !== undefined) {
          draft.preferences.budgetMin = action.payload.budgetMin
        }
        if (action.payload.budgetMax !== undefined) {
          draft.preferences.budgetMax = action.payload.budgetMax
        }
        if (action.payload.currency !== undefined) {
          draft.preferences.currency = action.payload.currency
        }
        break
      }
      case 'SET_TRIP_STATE': {
        if (
          !isValidTripStateTransition(draft.tripState, action.payload.tripState)
        ) {
          throw new Error(
            `Invalid trip state transition: ${draft.tripState} -> ${action.payload.tripState}`
          )
        }
        draft.tripState = action.payload.tripState
        break
      }
      default: {
        const neverAction: never = action
        throw new Error(`Unsupported action: ${JSON.stringify(neverAction)}`)
      }
    }
  }

  if (tripStateNext && tripStateNext !== draft.tripState) {
    if (!isValidTripStateTransition(draft.tripState, tripStateNext)) {
      throw new Error(
        `Invalid trip state transition: ${draft.tripState} -> ${tripStateNext}`
      )
    }
    draft.tripState = tripStateNext
  }

  normalizeDraft(draft)
  return draft
}

// ---------------------------------------------------------------------------
// Snapshot builder (pure)
// ---------------------------------------------------------------------------

function buildSnapshotFromDraft(
  tripId: string,
  version: number,
  draft: TripDraft
): TripSnapshot {
  return {
    tripId,
    version,
    tripState: draft.tripState,
    preferences: draft.preferences,
    days: draft.days.map(day => ({
      dayIndex: day.dayIndex,
      date: day.date,
      items: day.items.map(item => ({
        id: item.id,
        type: item.type,
        title: item.title,
        description: item.description,
        location: item.location,
        durationMin: item.durationMin,
        position: item.position,
        source: item.source
      }))
    }))
  }
}

// ---------------------------------------------------------------------------
// Budget helpers
// ---------------------------------------------------------------------------

function budgetToCents(value?: number): number | undefined {
  if (value === undefined) return undefined
  return Math.round(value * 100)
}

function centsToBudget(value?: number | null): number | undefined {
  if (value === null || value === undefined) return undefined
  return value / 100
}

// ---------------------------------------------------------------------------
// Load draft from DB – accepts a transaction instance to avoid nesting
// ---------------------------------------------------------------------------

async function loadDraftFromTx(
  tx: TxInstance,
  tripId: string
): Promise<{
  tripRecord: typeof trips.$inferSelect
  draft: TripDraft
}> {
  const [tripRecord] = await tx
    .select()
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1)

  if (!tripRecord) {
    throw new Error('Trip not found')
  }

  const [dayRows, itemRows, sourceRows] = await Promise.all([
    tx.select().from(itineraryDays).where(eq(itineraryDays.tripId, tripId)),
    tx.select().from(itineraryItems).where(eq(itineraryItems.tripId, tripId)),
    tx.select().from(tripSources).where(eq(tripSources.tripId, tripId))
  ])

  const sourceMap = new Map(sourceRows.map(s => [s.id, s]))
  const dayMap = new Map(
    dayRows.map(d => [
      d.id,
      {
        dayIndex: d.dayIndex,
        date: d.date ?? undefined,
        items: [] as TripDraft['days'][number]['items']
      }
    ])
  )

  for (const item of itemRows) {
    const day = dayMap.get(item.dayId)
    if (!day) continue
    const source = item.sourceId ? sourceMap.get(item.sourceId) : undefined
    day.items.push({
      id: item.id,
      dayIndex: day.dayIndex,
      position: item.position,
      type: item.itemType as TripDraft['days'][number]['items'][number]['type'],
      title: item.title,
      description: item.description ?? undefined,
      location: item.location ?? undefined,
      durationMin: item.durationMin ?? undefined,
      source: source
        ? {
            url: source.url,
            title: source.title ?? undefined,
            publisher: source.publisher ?? undefined,
            snippet: source.snippet ?? undefined
          }
        : undefined
    })
  }

  const draft: TripDraft = {
    tripState:
      (tripRecord.tripState as TripDraft['tripState']) ?? getDefaultTripState(),
    preferences: {
      ...(tripRecord.preferences as TripPreferences),
      origin: tripRecord.origin ?? undefined,
      destination: tripRecord.destination ?? undefined,
      budgetMin: centsToBudget(tripRecord.budgetMinCents),
      budgetMax: centsToBudget(tripRecord.budgetMaxCents),
      currency: tripRecord.currency ?? undefined
    },
    days: Array.from(dayMap.values())
  }

  normalizeDraft(draft)
  return { tripRecord, draft }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function createTrip(
  userId: string,
  title = 'New Trip'
): Promise<string> {
  const tripId = generateId()
  await withRLS(userId, async tx => {
    await tx.insert(trips).values({
      id: tripId,
      userId,
      title: title.slice(0, 256),
      tripState: getDefaultTripState(),
      preferences: {}
    })
  })
  return tripId
}

/**
 * Apply a batch of structured actions to a trip inside a single
 * database transaction. Guarantees:
 *
 * - **Idempotency** via `clientOperationId` — replaying the same
 *   operation returns the cached snapshot without mutating state.
 * - **Monotonic versioning** — `lastVersion` is bumped atomically.
 * - **Full audit trail** — every action is logged in `trip_action_logs`.
 * - **Snapshot persistence** — a complete snapshot is stored in
 *   `itinerary_versions` for instant retrieval.
 */
export async function applyTripActions(input: ApplyTripActionsInput): Promise<{
  version: number
  idempotent: boolean
  snapshot: TripSnapshot
}> {
  const {
    userId,
    tripId,
    clientOperationId,
    actions,
    assistantMessage,
    tripStateNext
  } = input

  return withRLS(userId, async tx => {
    // 1. Check idempotency
    const [existingVersion] = await tx
      .select()
      .from(itineraryVersions)
      .where(
        and(
          eq(itineraryVersions.tripId, tripId),
          eq(itineraryVersions.clientOperationId, clientOperationId)
        )
      )
      .limit(1)

    if (existingVersion) {
      return {
        version: existingVersion.versionNumber,
        idempotent: true,
        snapshot: existingVersion.snapshot as unknown as TripSnapshot
      }
    }

    // 2. Load current state within the SAME transaction (no nesting)
    const { tripRecord, draft } = await loadDraftFromTx(tx, tripId)

    // 3. Apply actions in-memory
    const nextDraft = applyActionsToDraft(draft, actions, tripStateNext)
    const nextVersion = tripRecord.lastVersion + 1

    // 4. Rewrite materialised structure
    await tx.delete(itineraryItems).where(eq(itineraryItems.tripId, tripId))
    await tx.delete(itineraryDays).where(eq(itineraryDays.tripId, tripId))
    await tx.delete(tripSources).where(eq(tripSources.tripId, tripId))

    const insertedDays = nextDraft.days.length
      ? await tx
          .insert(itineraryDays)
          .values(
            nextDraft.days.map(day => ({
              id: generateId(),
              tripId,
              dayIndex: day.dayIndex,
              date: day.date
            }))
          )
          .returning()
      : []

    const dayIdByIndex = new Map(
      insertedDays.map(day => [day.dayIndex, day.id])
    )

    const sourceInserts: Array<typeof tripSources.$inferInsert> = []
    const itemInserts: Array<typeof itineraryItems.$inferInsert> = []

    for (const day of nextDraft.days) {
      const dayId = dayIdByIndex.get(day.dayIndex)
      if (!dayId) continue
      for (const item of day.items) {
        let sourceId: string | undefined
        if (item.source) {
          sourceId = generateId()
          sourceInserts.push({
            id: sourceId,
            tripId,
            url: item.source.url,
            title: item.source.title,
            publisher: item.source.publisher,
            snippet: item.source.snippet
          })
        }
        itemInserts.push({
          id: item.id || generateId(),
          tripId,
          dayId,
          itemType: item.type,
          title: item.title.slice(0, 256),
          description: item.description,
          location: item.location,
          durationMin: item.durationMin,
          position: item.position,
          sourceId,
          metadata: {}
        })
      }
    }

    if (sourceInserts.length > 0) {
      await tx.insert(tripSources).values(sourceInserts)
    }
    if (itemInserts.length > 0) {
      await tx.insert(itineraryItems).values(itemInserts)
    }

    // 5. Update trip record
    await tx
      .update(trips)
      .set({
        updatedAt: new Date(),
        tripState: nextDraft.tripState,
        preferences: nextDraft.preferences as Record<string, unknown>,
        origin: nextDraft.preferences.origin,
        destination: nextDraft.preferences.destination,
        startDate: nextDraft.preferences.startDate,
        endDate: nextDraft.preferences.endDate,
        budgetMinCents: budgetToCents(nextDraft.preferences.budgetMin),
        budgetMaxCents: budgetToCents(nextDraft.preferences.budgetMax),
        currency: nextDraft.preferences.currency,
        lastVersion: nextVersion
      })
      .where(eq(trips.id, tripId))

    // 6. Persist version snapshot
    const snapshot = buildSnapshotFromDraft(tripId, nextVersion, nextDraft)
    const [versionRow] = await tx
      .insert(itineraryVersions)
      .values({
        id: generateId(),
        tripId,
        versionNumber: nextVersion,
        baseVersion: tripRecord.lastVersion,
        clientOperationId,
        summary: assistantMessage ?? null,
        snapshot: snapshot as unknown as Record<string, unknown>,
        createdBy: userId
      })
      .returning()

    // 7. Audit log
    if (actions.length > 0) {
      await tx.insert(tripActionLogs).values(
        actions.map(action => ({
          id: generateId(),
          tripId,
          versionId: versionRow.id,
          clientOperationId,
          actionType: action.type,
          payload: action as unknown as Record<string, unknown>,
          status: 'applied' as const,
          createdBy: userId
        }))
      )
    }

    return {
      version: nextVersion,
      idempotent: false,
      snapshot
    }
  })
}

export async function getTripSnapshot(
  userId: string,
  tripId: string
): Promise<TripSnapshot> {
  return withRLS(userId, async tx => {
    // Try to return latest cached version snapshot first
    const [latestVersion] = await tx
      .select()
      .from(itineraryVersions)
      .where(eq(itineraryVersions.tripId, tripId))
      .orderBy(desc(itineraryVersions.versionNumber))
      .limit(1)

    if (latestVersion) {
      return latestVersion.snapshot as unknown as TripSnapshot
    }

    // Fallback: build snapshot from materialised rows
    const { tripRecord, draft } = await loadDraftFromTx(tx, tripId)
    return buildSnapshotFromDraft(tripId, tripRecord.lastVersion, draft)
  })
}

export async function listTripActionLogs(
  userId: string,
  tripId: string,
  limit = 100
): Promise<Array<typeof tripActionLogs.$inferSelect>> {
  return withRLS(userId, async tx => {
    return tx
      .select()
      .from(tripActionLogs)
      .where(eq(tripActionLogs.tripId, tripId))
      .orderBy(desc(tripActionLogs.createdAt))
      .limit(limit)
  })
}

export async function deleteTripActionsByVersion(
  userId: string,
  tripId: string,
  versionIds: string[]
): Promise<void> {
  if (versionIds.length === 0) return
  await withRLS(userId, async tx => {
    await tx
      .delete(tripActionLogs)
      .where(
        and(
          eq(tripActionLogs.tripId, tripId),
          inArray(tripActionLogs.versionId, versionIds)
        )
      )
  })
}
