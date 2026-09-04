import { LOCAL_PROVIDERS } from '@/lib/hub-installed'
import { modelRouteKey } from './router'
import type {
  ModelRouteCandidate,
  ModelRouteCapability,
} from './types'

export type ModelRoutingDefinition = Partial<
  Pick<
    ModelRouteCandidate,
    | 'locality'
    | 'capabilities'
    | 'parameterCountB'
    | 'relativeSpeed'
    | 'relativeQuality'
    | 'priority'
  >
>

type BuildCandidatesInput = {
  providers: readonly ModelProvider[]
  activeModelIds: readonly string[]
  selectedProviderId?: string
  selectedModelId?: string
  definitions?: Readonly<Record<string, ModelRoutingDefinition>>
}

const RECOGNIZED_CAPABILITIES = new Set<ModelRouteCapability>([
  'general',
  'coding',
  'reasoning',
  'vision',
])

function inferredCapabilities(model: Model): ModelRouteCapability[] {
  const capabilities: ModelRouteCapability[] = ['general', 'coding']
  for (const capability of model.capabilities ?? []) {
    if (
      RECOGNIZED_CAPABILITIES.has(capability as ModelRouteCapability) &&
      !capabilities.includes(capability as ModelRouteCapability)
    ) {
      capabilities.push(capability as ModelRouteCapability)
    }
  }
  return capabilities
}

export function inferParameterCountB(value: string): number | undefined {
  const match = value.match(/(?:^|[-_/\s])(\d+(?:\.\d+)?)\s*[xX]?\s*[bB](?=$|[-_/\s])/)
  if (!match) return undefined
  const count = Number(match[1])
  return Number.isFinite(count) && count > 0 ? count : undefined
}

export function buildModelRouteCandidates({
  providers,
  activeModelIds,
  selectedProviderId,
  selectedModelId,
  definitions = {},
}: BuildCandidatesInput): ModelRouteCandidate[] {
  const localProviders = new Set<string>(LOCAL_PROVIDERS)
  const active = new Set(activeModelIds)
  const candidates: ModelRouteCandidate[] = []

  for (const provider of providers) {
    if (!provider.active) continue

    for (const model of provider.models) {
      if (model.missing || model.embedding) continue

      const key = modelRouteKey(provider.provider, model.id)
      const definition = definitions[key]
      candidates.push({
        providerId: provider.provider,
        modelId: model.id,
        displayName: model.displayName || model.name || model.id,
        locality:
          definition?.locality ??
          (localProviders.has(provider.provider) ? 'local' : 'external'),
        availability: active.has(model.id) ? 'ready' : 'available',
        capabilities:
          definition?.capabilities ?? inferredCapabilities(model),
        parameterCountB:
          definition?.parameterCountB ??
          inferParameterCountB(`${model.name ?? ''} ${model.id}`),
        relativeSpeed: definition?.relativeSpeed,
        relativeQuality: definition?.relativeQuality,
        priority:
          definition?.priority ??
          (provider.provider === selectedProviderId &&
          model.id === selectedModelId
            ? 100
            : 0),
      })
    }
  }

  return candidates
}
