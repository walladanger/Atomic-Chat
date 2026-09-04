import type {
  ModelRouteCandidate,
  ModelRouteCapability,
  ModelRouteDecision,
  ModelRouteRequest,
  ModelRouteSignals,
} from './types'

const ROUTE_KEY_SEPARATOR = '::'

export function modelRouteKey(providerId: string, modelId: string): string {
  return `${providerId}${ROUTE_KEY_SEPARATOR}${modelId}`
}

function compareText(left: ModelRouteCandidate, right: ModelRouteCandidate) {
  return modelRouteKey(left.providerId, left.modelId).localeCompare(
    modelRouteKey(right.providerId, right.modelId)
  )
}

function readiness(candidate: ModelRouteCandidate): number {
  return candidate.availability === 'ready' ? 1 : 0
}

function supports(
  candidate: ModelRouteCandidate,
  required: readonly ModelRouteCapability[]
): boolean {
  return required.every((capability) =>
    candidate.capabilities.includes(capability)
  )
}

function usableCandidates(
  candidates: readonly ModelRouteCandidate[],
  required: readonly ModelRouteCapability[]
): ModelRouteCandidate[] {
  return candidates.filter(
    (candidate) =>
      candidate.availability !== 'unavailable' && supports(candidate, required)
  )
}

function compareFast(
  left: ModelRouteCandidate,
  right: ModelRouteCandidate
): number {
  const locality = Number(right.locality === 'local') - Number(left.locality === 'local')
  if (locality) return locality

  const ready = readiness(right) - readiness(left)
  if (ready) return ready

  const speed = (right.relativeSpeed ?? 0) - (left.relativeSpeed ?? 0)
  if (speed) return speed

  const leftSize = left.parameterCountB ?? Number.POSITIVE_INFINITY
  const rightSize = right.parameterCountB ?? Number.POSITIVE_INFINITY
  if (leftSize !== rightSize) return leftSize - rightSize

  const priority = (right.priority ?? 0) - (left.priority ?? 0)
  return priority || compareText(left, right)
}

function compareStrong(
  left: ModelRouteCandidate,
  right: ModelRouteCandidate
): number {
  const quality = (right.relativeQuality ?? 0) - (left.relativeQuality ?? 0)
  if (quality) return quality

  const size = (right.parameterCountB ?? 0) - (left.parameterCountB ?? 0)
  if (size) return size

  const priority = (right.priority ?? 0) - (left.priority ?? 0)
  if (priority) return priority

  const ready = readiness(right) - readiness(left)
  return ready || compareText(left, right)
}

function pickAuto(candidates: readonly ModelRouteCandidate[]) {
  const local = candidates.filter((candidate) => candidate.locality === 'local')
  if (local.length > 0) {
    return {
      candidate: [...local].sort(compareFast)[0],
      reason: 'Using the fastest available local model.',
    }
  }

  return {
    candidate: [...candidates].sort(compareFast)[0],
    reason: 'Using an available external provider.',
  }
}

function needsEscalation(signals: ModelRouteSignals | undefined): boolean {
  if (!signals) return false
  return Boolean(
    signals.taskKind === 'architecture' ||
      signals.taskKind === 'review' ||
      (signals.fileCount ?? 0) >= 8 ||
      (signals.contextTokens ?? 0) >= 32_768 ||
      (signals.toolFailures ?? 0) >= 2 ||
      (signals.testFailures ?? 0) >= 2 ||
      signals.requiredCapabilities?.includes('reasoning')
  )
}

function escalationFor(
  request: ModelRouteRequest,
  primary: ModelRouteCandidate | null,
  candidates: readonly ModelRouteCandidate[]
): ModelRouteDecision['escalation'] {
  if (request.strategy === 'fast') {
    return { status: 'inactive', reason: 'Fast strategy does not escalate.' }
  }
  if (request.strategy !== 'auto') {
    return {
      status: 'inactive',
      reason: 'Automatic escalation is only active in Auto strategy.',
    }
  }
  if (!needsEscalation(request.signals)) {
    return {
      status: 'inactive',
      reason: 'The current task does not require escalation.',
    }
  }

  const alternatives = candidates
    .filter(
      (candidate) =>
        modelRouteKey(candidate.providerId, candidate.modelId) !==
        (primary ? modelRouteKey(primary.providerId, primary.modelId) : '')
    )
    .filter((candidate) => candidate.capabilities.includes('reasoning'))
    .sort(compareStrong)

  if (alternatives.length === 0) {
    return {
      status: 'inactive',
      reason: 'No stronger model is currently available.',
    }
  }

  return {
    status: 'available',
    model: alternatives[0],
    reason: 'Objective task signals requested a stronger model.',
  }
}

export function routeModel(request: ModelRouteRequest): ModelRouteDecision {
  const required = request.requiredCapabilities ?? []
  const usable = usableCandidates(request.candidates, required)

  if (usable.length === 0) {
    return {
      primary: null,
      primaryReason: 'No model selected.',
      fallbackReason: 'No configured model is currently available.',
      escalation: {
        status: 'inactive',
        reason: 'Escalation is unavailable until a model is configured.',
      },
    }
  }

  let primary: ModelRouteCandidate
  let primaryReason: string
  let fallbackReason: string | undefined

  if (request.strategy === 'manual') {
    const manual = usable.find(
      (candidate) =>
        modelRouteKey(candidate.providerId, candidate.modelId) ===
        request.manualModelKey
    )
    if (manual) {
      primary = manual
      primaryReason = 'Using the manually selected model.'
    } else {
      const auto = pickAuto(usable)
      primary = auto.candidate
      primaryReason = auto.reason
      fallbackReason = 'The manual model is unavailable; using the Auto fallback.'
    }
  } else if (request.strategy === 'best-local') {
    const local = usable.filter((candidate) => candidate.locality === 'local')
    if (local.length > 0) {
      primary = [...local].sort(compareStrong)[0]
      primaryReason = 'Using the strongest available local model.'
    } else {
      const auto = pickAuto(usable)
      primary = auto.candidate
      primaryReason = auto.reason
      fallbackReason = 'Best Local is unavailable; using the Auto fallback.'
    }
  } else if (request.strategy === 'fast') {
    primary = [...usable].sort(compareFast)[0]
    primaryReason = 'Using the fastest available model.'
  } else {
    const auto = pickAuto(usable)
    primary = auto.candidate
    primaryReason = auto.reason
    if (primary.locality === 'external') {
      fallbackReason = 'No local model is available; using an external provider.'
    }
  }

  return {
    primary,
    primaryReason,
    fallbackReason,
    escalation: escalationFor(request, primary, usable),
  }
}
