import { describe, expect, it } from 'vitest'

import {
  getDefaultTripState,
  getStateGuidancePrompt,
  isValidTripStateTransition,
  normalizeTripState
} from '@/lib/travel/state-machine'
import type { TripState } from '@/lib/travel/types'

describe('isValidTripStateTransition', () => {
  it('allows same-state transition', () => {
    const states: TripState[] = [
      'DISCOVERY',
      'SELECTION',
      'PLANNING',
      'REFINEMENT',
      'FINALIZATION'
    ]
    for (const s of states) {
      expect(isValidTripStateTransition(s, s)).toBe(true)
    }
  })

  it('allows DISCOVERY -> SELECTION', () => {
    expect(isValidTripStateTransition('DISCOVERY', 'SELECTION')).toBe(true)
  })

  it('allows DISCOVERY -> PLANNING', () => {
    expect(isValidTripStateTransition('DISCOVERY', 'PLANNING')).toBe(true)
  })

  it('blocks DISCOVERY -> FINALIZATION', () => {
    expect(isValidTripStateTransition('DISCOVERY', 'FINALIZATION')).toBe(false)
  })

  it('blocks DISCOVERY -> REFINEMENT', () => {
    expect(isValidTripStateTransition('DISCOVERY', 'REFINEMENT')).toBe(false)
  })

  it('allows PLANNING -> REFINEMENT', () => {
    expect(isValidTripStateTransition('PLANNING', 'REFINEMENT')).toBe(true)
  })

  it('allows PLANNING -> FINALIZATION', () => {
    expect(isValidTripStateTransition('PLANNING', 'FINALIZATION')).toBe(true)
  })

  it('allows REFINEMENT -> PLANNING (backtrack)', () => {
    expect(isValidTripStateTransition('REFINEMENT', 'PLANNING')).toBe(true)
  })

  it('allows FINALIZATION -> REFINEMENT (backtrack)', () => {
    expect(isValidTripStateTransition('FINALIZATION', 'REFINEMENT')).toBe(true)
  })

  it('blocks FINALIZATION -> DISCOVERY', () => {
    expect(isValidTripStateTransition('FINALIZATION', 'DISCOVERY')).toBe(false)
  })
})

describe('normalizeTripState', () => {
  it('returns valid state unchanged', () => {
    expect(normalizeTripState('PLANNING')).toBe('PLANNING')
  })

  it('falls back to default for invalid string', () => {
    expect(normalizeTripState('INVALID')).toBe(getDefaultTripState())
  })

  it('falls back to default for non-string', () => {
    expect(normalizeTripState(42)).toBe(getDefaultTripState())
    expect(normalizeTripState(null)).toBe(getDefaultTripState())
    expect(normalizeTripState(undefined)).toBe(getDefaultTripState())
  })
})

describe('getDefaultTripState', () => {
  it('returns DISCOVERY', () => {
    expect(getDefaultTripState()).toBe('DISCOVERY')
  })
})

describe('getStateGuidancePrompt', () => {
  it('returns non-empty guidance for every state', () => {
    const states: TripState[] = [
      'DISCOVERY',
      'SELECTION',
      'PLANNING',
      'REFINEMENT',
      'FINALIZATION'
    ]
    for (const s of states) {
      const prompt = getStateGuidancePrompt(s)
      expect(prompt.length).toBeGreaterThan(10)
    }
  })
})
