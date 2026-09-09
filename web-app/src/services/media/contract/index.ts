/**
 * Media contract v2 — the app-wide seam between the Media surface and any
 * media provider.
 *
 * This module is types plus one pure function (`validateParams`). It adds no
 * runtime behaviour, performs no I/O, imports nothing from React, and does not
 * depend on `@/services/atomicMedia`, which is v1 and becomes the Atomic Media
 * Worker adapter's private implementation detail.
 */

export {
  MEDIA_TASK,
  type MediaOutputMediaType,
  type MediaTaskId,
  type MediaTaskPresentation,
} from './tasks'

export {
  validateParams,
  type MediaParamDependency,
  type MediaParamModulus,
  type MediaParamOption,
  type MediaParamSpec,
  type MediaParamType,
  type MediaParamValidationError,
  type MediaParamValidationErrorCode,
  type MediaParamValidationResult,
} from './params'

export {
  MEDIA_CONTRACT_VERSION,
  type MediaCapabilities,
  type MediaDeviceDescriptor,
  type MediaFitness,
  type MediaFitnessStatus,
  type MediaInstallState,
  type MediaModelDescriptor,
  type MediaProviderFeatures,
} from './models'

export {
  type MediaJobError,
  type MediaJobHandle,
  type MediaJobSnapshot,
  type MediaJobState,
  type MediaOutputRef,
  type MediaProviderAdapter,
  type MediaProviderAdapterId,
  type MediaProviderDescriptor,
  type MediaProviderHealth,
  type MediaProviderKind,
  type NormalizedMediaRequest,
} from './jobs'
