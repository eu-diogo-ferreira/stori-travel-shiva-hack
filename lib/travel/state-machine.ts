import { TripState } from './types'

const stateOrder: TripState[] = [
  'DISCOVERY',
  'SELECTION',
  'PLANNING',
  'REFINEMENT',
  'FINALIZATION'
]

const transitions: Record<TripState, TripState[]> = {
  DISCOVERY: ['SELECTION', 'PLANNING'],
  SELECTION: ['DISCOVERY', 'PLANNING'],
  PLANNING: ['SELECTION', 'REFINEMENT', 'FINALIZATION'],
  REFINEMENT: ['PLANNING', 'FINALIZATION'],
  FINALIZATION: ['REFINEMENT']
}

export function isValidTripStateTransition(
  fromState: TripState,
  toState: TripState
): boolean {
  if (fromState === toState) return true
  return transitions[fromState].includes(toState)
}

export function getDefaultTripState(): TripState {
  return 'DISCOVERY'
}

export function normalizeTripState(value: unknown): TripState {
  if (typeof value !== 'string') return getDefaultTripState()
  if (stateOrder.includes(value as TripState)) {
    return value as TripState
  }
  return getDefaultTripState()
}

export function getStateGuidancePrompt(state: TripState): string {
  switch (state) {
    case 'DISCOVERY':
      return 'Conduza descoberta: preferências, orçamento, datas, origem, companhia, ritmo e restrições.'
    case 'SELECTION':
      return 'Conduza seleção de destino com comparações objetivas e trade-offs.'
    case 'PLANNING':
      return 'Construa itinerário por dias com itens ordenados e duração estimada.'
    case 'REFINEMENT':
      return 'Otimize roteiro: equilíbrio de ritmo, custo, deslocamentos e conflitos.'
    case 'FINALIZATION':
      return 'Feche checklist final: reservas, documentos, logística e pendências.'
    default:
      return 'Conduza o planejamento de viagem incrementalmente.'
  }
}
