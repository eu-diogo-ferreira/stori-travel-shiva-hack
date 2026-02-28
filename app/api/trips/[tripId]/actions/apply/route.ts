import { NextResponse } from 'next/server'

import { applyTripActions } from '@/lib/actions/trip-actions'
import { getCurrentUserId } from '@/lib/auth/get-current-user'
import { applyTripActionsRequestSchema } from '@/lib/travel/schemas'

export async function POST(
  req: Request,
  context: { params: Promise<{ tripId: string }> }
) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const { tripId: tripIdParam } = await context.params
    const body = await req.json()
    const parsed = applyTripActionsRequestSchema.safeParse({
      ...body,
      tripId: body?.tripId ?? tripIdParam
    })
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const payload = parsed.data
    if (payload.tripId !== tripIdParam) {
      return NextResponse.json(
        { error: 'tripId from path and payload must match' },
        { status: 400 }
      )
    }

    const result = await applyTripActions({
      userId,
      tripId: payload.tripId,
      clientOperationId: payload.clientOperationId,
      actions: payload.actions,
      assistantMessage: payload.assistantMessage,
      tripStateNext: payload.tripStateNext
    })

    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    console.error('Apply trip actions route error:', error)
    return NextResponse.json(
      { error: 'Failed to apply trip actions' },
      { status: 500 }
    )
  }
}
