/**
 * Media contract v2 — models, devices and provider capabilities.
 *
 * Pure types. No I/O, no React.
 */

import type { MediaParamSpec } from './params'
import type {
  MediaOutputMediaType,
  MediaTaskId,
  MediaTaskPresentation,
} from './tasks'

export type MediaFitnessStatus =
  | 'recommended'
  | 'runnable'
  | 'degraded'
  | 'unsupported'

export type MediaFitness = {
  status: MediaFitnessStatus
  reason_key?: string
  reason?: string
  required_device?: string | null
  min_vram_mb?: number
  notes?: string[]
}

export type MediaInstallState = {
  installed: boolean
  /** The provider exposes an install path for this model. */
  installable: boolean
  size_bytes?: number
  version?: string
  update_available?: boolean
  source?: { kind: 'huggingface' | 'url' | 'provider'; ref?: string }
}

export type MediaModelDescriptor = {
  /**
   * Globally unique and provider-qualified: `${provider_id}:${local_id}`.
   * Two providers may both expose `sdxl-base`; unqualified ids make the
   * selection state ambiguous the moment a second provider exists, and that
   * ambiguity cannot be fixed later without a data migration.
   */
  id: string
  provider_id: string
  local_id: string

  label: string
  description_key?: string
  /** Display only, e.g. `wan2.2`, `flux`, `sdxl`. Never behavioural. */
  family?: string
  repo?: string

  tasks: MediaTaskId[]
  /**
   * Per-task parameter schema. Every key must appear in `tasks`. Keyed by task
   * because the same model routinely takes different knobs for
   * `image_to_video` than for `text_to_video`; one flat list would force
   * `depends_on` gymnastics onto every entry.
   */
  params: Record<MediaTaskId, MediaParamSpec[]>

  install?: MediaInstallState
  fitness?: MediaFitness
  license?: { id?: string; url?: string; gated?: boolean }
  outputs?: Partial<
    Record<
      MediaTaskId,
      {
        media_type: MediaOutputMediaType
        mime?: string[]
      }
    >
  >
  /** Non-local providers only. Display-only; never used to gate submission. */
  cost?: { unit: 'credit' | 'usd'; per_job?: number; note_key?: string }
}

export type MediaDeviceDescriptor = {
  id: string
  label: string
  backend?: string
  vram_total_mb?: number
  vram_free_mb?: number
}

export type MediaProviderFeatures = {
  cancel?: boolean
  progress?: boolean
  queue?: boolean
  /** SSE/WS streaming available. Must match `MediaProviderAdapter.subscribe`. */
  events?: boolean
  install?: boolean
  batch?: boolean
}

export type MediaCapabilities = {
  contract_version: 2
  provider_id: string
  devices: MediaDeviceDescriptor[]
  models: MediaModelDescriptor[]
  /** Presentation metadata for the tasks this provider's models expose. */
  tasks?: MediaTaskPresentation[]
  recommended?: Array<{ task: MediaTaskId; model_id: string }>
  features?: MediaProviderFeatures
}

/** Contract version this build speaks. */
export const MEDIA_CONTRACT_VERSION = 2 as const

/**
 * Version negotiation window (plan section 5.2).
 *
 * A provider reporting 1 is upcast; 2 is used directly. Anything higher must be
 * refused outright rather than partially parsed - a half-understood future
 * contract silently generates with settings the user did not choose.
 */
export const MEDIA_CONTRACT_MIN_SUPPORTED = 1
export const MEDIA_CONTRACT_MAX_SUPPORTED = 2
