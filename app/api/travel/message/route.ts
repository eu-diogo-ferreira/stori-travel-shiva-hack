import { NextResponse } from 'next/server'

import { createTrip, getTripSnapshot } from '@/lib/actions/trip-actions'
import { getCurrentUserId } from '@/lib/auth/get-current-user'
import { buildTravelAssistantEnvelope } from '@/lib/travel/orchestrator'
import { travelMessageRequestSchema } from '@/lib/travel/schemas'

export async function POST(req: Request) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const body = await req.json()
    const parsed = travelMessageRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { message, clientOperationId } = parsed.data
    const tripId =
      parsed.data.tripId ?? (await createTrip(userId, 'Trip Planning'))

    let currentState: ReturnType<
      typeof buildTravelAssistantEnvelope
    >['trip_state_next'] = 'DISCOVERY'
    try {
      const snapshot = await getTripSnapshot(userId, tripId)
      currentState = snapshot.tripState
    } catch {
      // Keep default state for brand new trip or inaccessible snapshot.
    }

    const envelope = buildTravelAssistantEnvelope({
      message,
      currentState
    })

    return NextResponse.json(
      {
        tripId,
        assistant: {
          ...envelope,
          client_operation_id: clientOperationId ?? envelope.client_operation_id
        }
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Travel message route error:', error)
    return NextResponse.json(
      { error: 'Error generating travel plan response' },
      { status: 500 }
    )
  }
}
