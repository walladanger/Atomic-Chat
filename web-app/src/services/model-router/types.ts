export type ModelStrategy = 'auto' | 'fast' | 'best-local' | 'manual'

export type ModelRouteCapability =
  | 'general'
  | 'coding'
  | 'reasoning'
  | 'vision'

export type ModelRouteAvailability = 'ready' | 'available' | 'unavailable'

export type ModelRouteCandidate = {
  providerId: string
  modelId: string
  displayName?: string
  locality: 'local' | 'external'
  availability: ModelRouteAvailability
  capabilities: ModelRouteCapability[]
  parameterCountB?: number
  relativeSpeed?: number
  relativeQuality?: number
  priority?: number
}

export type ModelRouteSignals = {
  taskKind?: 'build' | 'debug' | 'review' | 'architecture'
  fileCount?: number
  contextTokens?: number
  toolFailures?: number
  testFailures?: number
  requiredCapabilities?: ModelRouteCapability[]
}

export type ModelRouteRequest = {
  strategy: ModelStrategy
  candidates: ModelRouteCandidate[]
  manualModelKey?: string | null
  requiredCapabilities?: ModelRouteCapability[]
  signals?: ModelRouteSignals
}

export type ModelEscalationDecision =
  | { status: 'available'; model: ModelRouteCandidate; reason: string }
  | { status: 'inactive'; reason: string }

export type ModelRouteDecision = {
  primary: ModelRouteCandidate | null
  primaryReason: string
  fallbackReason?: string
  escalation: ModelEscalationDecision
}
