import { generateId } from '@/lib/db/schema'

import { getDefaultTripState, getStateGuidancePrompt } from './state-machine'
import { TravelAssistantEnvelope, TripState } from './types'

interface BuildTravelPlanInput {
  message: string
  currentState?: TripState
}

export function buildTravelAssistantEnvelope({
  message,
  currentState
}: BuildTravelPlanInput): TravelAssistantEnvelope {
  const normalizedState = currentState ?? getDefaultTripState()
  const promptHint = getStateGuidancePrompt(normalizedState)
  const lowered = message.toLowerCase()

  const actions: TravelAssistantEnvelope['actions'] = []
  let nextState: TripState = normalizedState
  let assistantMessage = `Entendi. ${promptHint} Vou estruturar o próximo passo do seu planejamento.`

  if (lowered.includes('roteiro') || lowered.includes('dia')) {
    nextState = normalizedState === 'DISCOVERY' ? 'PLANNING' : normalizedState
    actions.push(
      { type: 'CREATE_DAY', payload: { dayIndex: 1 } },
      {
        type: 'ADD_ITEM',
        payload: {
          item: {
            type: 'attraction',
            title: 'Ponto inicial sugerido',
            description:
              'Item inicial gerado automaticamente para começar o roteiro.',
            dayIndex: 1,
            durationMin: 120
          }
        }
      }
    )
    assistantMessage =
      'Sugeri um ponto inicial no Dia 1 para começarmos seu roteiro. Me diga preferências para refinarmos.'
  } else if (lowered.includes('orçamento') || lowered.includes('budget')) {
    actions.push({
      type: 'UPDATE_BUDGET',
      payload: { currency: 'USD' }
    })
    nextState = normalizedState === 'DISCOVERY' ? 'SELECTION' : normalizedState
    assistantMessage =
      'Perfeito. Registrei o contexto de orçamento e vou adaptar as próximas sugestões ao seu perfil.'
  } else {
    actions.push({
      type: 'UPDATE_TRIP_PREFERENCES',
      payload: {
        patch: {
          notes: message.slice(0, 2000)
        }
      }
    })
  }

  return {
    assistant_message: assistantMessage,
    trip_state_next: nextState,
    actions,
    client_operation_id: generateId()
  }
}
