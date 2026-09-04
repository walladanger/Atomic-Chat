import { describe, expect, it } from 'vitest'
import { buildModelRouteCandidates } from './provider-adapter'
import { modelRouteKey } from './router'

const provider = (
  providerId: string,
  models: Model[],
  active = true
): ModelProvider => ({
  provider: providerId,
  active,
  models,
  settings: [],
})

describe('buildModelRouteCandidates', () => {
  it('normalizes installed local and configured external models', () => {
    const candidates = buildModelRouteCandidates({
      providers: [
        provider('llamacpp-upstream', [
          { id: 'Atomic-Coder-4B-Q4', capabilities: ['reasoning'] },
        ]),
        provider('remote-provider', [{ id: 'remote-code' }]),
      ],
      activeModelIds: ['Atomic-Coder-4B-Q4'],
      selectedProviderId: 'remote-provider',
      selectedModelId: 'remote-code',
    })

    expect(candidates).toEqual([
      {
        providerId: 'llamacpp-upstream',
        modelId: 'Atomic-Coder-4B-Q4',
        displayName: 'Atomic-Coder-4B-Q4',
        locality: 'local',
        availability: 'ready',
        capabilities: ['general', 'coding', 'reasoning'],
        parameterCountB: 4,
        priority: 0,
      },
      {
        providerId: 'remote-provider',
        modelId: 'remote-code',
        displayName: 'remote-code',
        locality: 'external',
        availability: 'available',
        capabilities: ['general', 'coding'],
        parameterCountB: undefined,
        priority: 100,
      },
    ])
  })

  it('excludes disabled providers, missing weights, and embedding models', () => {
    const candidates = buildModelRouteCandidates({
      providers: [
        provider('disabled', [{ id: 'disabled-model' }], false),
        provider('llamacpp-upstream', [
          { id: 'missing-model', missing: true },
          { id: 'embedding-model', embedding: true },
          { id: 'usable-model' },
        ]),
      ],
      activeModelIds: [],
    })

    expect(candidates.map((entry) => entry.modelId)).toEqual(['usable-model'])
  })

  it('lets configuration override inferred routing metadata', () => {
    const key = modelRouteKey('custom-local', 'model-without-size')
    const candidates = buildModelRouteCandidates({
      providers: [provider('custom-local', [{ id: 'model-without-size' }])],
      activeModelIds: [],
      definitions: {
        [key]: {
          locality: 'local',
          capabilities: ['coding', 'vision'],
          parameterCountB: 2.7,
          relativeSpeed: 9,
          relativeQuality: 3,
          priority: 7,
        },
      },
    })

    expect(candidates[0]).toMatchObject({
      locality: 'local',
      capabilities: ['coding', 'vision'],
      parameterCountB: 2.7,
      relativeSpeed: 9,
      relativeQuality: 3,
      priority: 7,
    })
  })
})
