/**
 * Media contract v2 — task identity and presentation.
 *
 * Pure types plus constants. No I/O, no React, and no imports from
 * `@/services/atomicMedia`: that module is v1 and becomes the worker adapter's
 * private detail, not an app-wide dependency of this contract.
 */

/**
 * Open vocabulary. Well-known ids are constants rather than a closed union so
 * that a provider announcing a task this build has never heard of still
 * renders. The compiler loses exhaustive `switch` checking on task; in exchange
 * an unknown task degrades to "id-as-label plus a download affordance" instead
 * of crashing the surface.
 */
export type MediaTaskId = string

export const MEDIA_TASK = {
  TEXT_TO_IMAGE: 'text_to_image',
  IMAGE_TO_IMAGE: 'image_to_image',
  TEXT_TO_VIDEO: 'text_to_video',
  IMAGE_TO_VIDEO: 'image_to_video',
  TEXT_TO_AUDIO: 'text_to_audio',
  TEXT_TO_SPEECH: 'text_to_speech',
  UPSCALE: 'upscale',
  INPAINT: 'inpaint',
  OUTPAINT: 'outpaint',
  INTERPOLATE: 'interpolate',
} as const satisfies Record<string, MediaTaskId>

/** The media kind a task emits. `unknown` renders a download, not a player. */
export type MediaOutputMediaType =
  | 'image'
  | 'video'
  | 'audio'
  | 'model3d'
  | 'unknown'

/**
 * Presentation only. Never load-bearing: the UI branches on
 * `output_media_type` and nothing else here.
 */
export type MediaTaskPresentation = {
  id: MediaTaskId
  /** i18n key, e.g. `media:task.text_to_video`. Preferred over `label`. */
  label_key?: string
  /** Provider-supplied fallback used when no i18n key is known. */
  label?: string
  icon?: string
  order?: number
  output_media_type: MediaOutputMediaType
}
