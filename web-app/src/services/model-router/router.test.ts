import { describe, expect, it } from 'vitest'
import { modelRouteKey, routeModel } from './router'
import type { ModelRouteCandidate } from './types'

const candidate = (
  values: Partial<ModelRouteCandidate> &
    Pick<ModelRouteCandidate, 'providerId' | 'modelId'>
): ModelRouteCandidate => ({
  locality: 'local',
  availability: 'available',
  capabilities: ['coding'],
  priority: 0,
  ...values,
})

describe('routeModel', () => {
  it('uses the smallest available local coding model for Auto', () => {
    const decision = routeModel({
      strategy: 'auto',
      candidates: [
        candidate({ providerId: 'device', modelId: 'large', parameterCountB: 24 }),
        candidate({ providerId: 'cloud', modelId: 'remote', locality: 'external' }),
        candidate({ providerId: 'device', modelId: 'small', parameterCountB: 4 }),
      ],
      requiredCapabilities: ['coding'],
    })

    expect(decision.primary?.modelId).toBe('small')
    expect(decision.fallbackReason).toBeUndefined()
  })

  it('falls back to an external provider when no local model is available', () => {
    const decision = routeModel({
      strategy: 'auto',
      candidates: [
        candidate({
          providerId: 'device',
          modelId: 'missing',
          availability: 'unavailable',
        }),
        candidate({ providerId: 'cloud', modelId: 'remote', locality: 'external' }),
      ],
    })

    expect(decision.primary).toMatchObject({ providerId: 'cloud', modelId: 'remote' })
    expect(decision.fallbackReason).toBe('No local model is available; using an external provider.')
  })

  it('falls back from Best Local when the device has no available local model', () => {
    const decision = routeModel({
      strategy: 'best-local',
      candidates: [
        candidate({ providerId: 'cloud', modelId: 'remote', locality: 'external' }),
      ],
    })

    expect(decision.primary?.modelId).toBe('remote')
    expect(decision.fallbackReason).toBe('Best Local is unavailable; using the Auto fallback.')
  })

  it('uses Auto when a Manual selection is unavailable', () => {
    const decision = routeModel({
      strategy: 'manual',
      manualModelKey: modelRouteKey('device', 'missing'),
      candidates: [
        candidate({ providerId: 'device', modelId: 'missing', availability: 'unavailable' }),
        candidate({ providerId: 'device', modelId: 'small', parameterCountB: 3 }),
      ],
    })

    expect(decision.primary?.modelId).toBe('small')
    expect(decision.fallbackReason).toBe('The manual model is unavailable; using the Auto fallback.')
  })

  it('keeps escalation inactive in Fast mode', () => {
    const decision = routeModel({
      strategy: 'fast',
      candidates: [
        candidate({ providerId: 'device', modelId: 'small', parameterCountB: 4 }),
        candidate({ providerId: 'device', modelId: 'strong', parameterCountB: 30 }),
      ],
      signals: { fileCount: 12, taskKind: 'architecture' },
    })

    expect(decision.primary?.modelId).toBe('small')
    expect(decision.escalation).toEqual({
      status: 'inactive',
      reason: 'Fast strategy does not escalate.',
    })
  })

  it('prepares a stronger model for objective Auto escalation signals', () => {
    const decision = routeModel({
      strategy: 'auto',
      candidates: [
        candidate({ providerId: 'device', modelId: 'small', parameterCountB: 4 }),
        candidate({
          providerId: 'device',
          modelId: 'strong',
          parameterCountB: 30,
          capabilities: ['coding', 'reasoning'],
        }),
      ],
      signals: { testFailures: 2 },
    })

    expect(decision.primary?.modelId).toBe('small')
    expect(decision.escalation).toMatchObject({
      status: 'available',
      model: { providerId: 'device', modelId: 'strong' },
    })
  })

  it('reports unavailable escalation without blocking the primary model', () => {
    const decision = routeModel({
      strategy: 'auto',
      candidates: [
        candidate({ providerId: 'device', modelId: 'small', parameterCountB: 4 }),
      ],
      signals: { toolFailures: 2 },
    })

    expect(decision.primary?.modelId).toBe('small')
    expect(decision.escalation).toEqual({
      status: 'inactive',
      reason: 'No stronger model is currently available.',
    })
  })

  it('returns an empty but usable decision when no model is configured', () => {
    const decision = routeModel({ strategy: 'auto', candidates: [] })

    expect(decision.primary).toBeNull()
    expect(decision.escalation.status).toBe('inactive')
    expect(decision.fallbackReason).toBe('No configured model is currently available.')
  })
})
