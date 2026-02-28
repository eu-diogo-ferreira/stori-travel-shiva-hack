import { NextResponse } from 'next/server'

import { getTripSnapshot } from '@/lib/actions/trip-actions'
import { getCurrentUserId } from '@/lib/auth/get-current-user'

export async function GET(
  _req: Request,
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

    const { tripId } = await context.params
    const snapshot = await getTripSnapshot(userId, tripId)
    return NextResponse.json(snapshot, { status: 200 })
  } catch (error) {
    console.error('Trip snapshot route error:', error)
    return NextResponse.json(
      { error: 'Failed to load trip snapshot' },
      { status: 500 }
    )
  }
}
