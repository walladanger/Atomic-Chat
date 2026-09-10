/**
 * The non-component half of the parameter renderer: DOM identities, shared
 * Tailwind classes, and group ordering.
 *
 * Split out because `react-refresh/only-export-components` is right - a file
 * that exports both a component and helpers breaks fast refresh, and the rule's
 * own advice is to put shared constants and functions in their own file.
 */

import type { MediaParamSpec } from '@/services/media/contract'

/** Verbatim from MediaGenerationForm.tsx:11-12. Visual parity depends on it. */
export const fieldClass =
  'h-9 w-full rounded-lg border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus:border-foreground/30 focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50'

/** Verbatim from MediaGenerationForm.tsx:14. */
export const labelClass = 'mb-1.5 block text-xs font-medium text-muted-foreground'

/**
 * The DOM identities the current form already uses.
 *
 * Not derivable - `negative_prompt` is `media-negative`, `guidance_scale` is
 * `media-guidance` - so they are listed rather than computed. Anything absent
 * gets `media-<id>`, which is what a provider-specific parameter needs.
 * Existing suites assert on these, and changing them would also be an
 * accessibility regression.
 */
const WELL_KNOWN: Record<string, { domId: string; ariaLabel: string }> = {
  prompt: { domId: 'media-prompt', ariaLabel: 'Prompt' },
  negative_prompt: { domId: 'media-negative', ariaLabel: 'Negative prompt' },
  resolution: { domId: 'media-resolution', ariaLabel: 'Resolution' },
  num_frames: { domId: 'media-frames', ariaLabel: 'Frames' },
  fps: { domId: 'media-fps', ariaLabel: 'FPS' },
  steps: { domId: 'media-steps', ariaLabel: 'Steps' },
  guidance_scale: { domId: 'media-guidance', ariaLabel: 'Guidance' },
  seed: { domId: 'media-seed', ariaLabel: 'Seed' },
  device: { domId: 'media-device', ariaLabel: 'Device' },
  input_image: { domId: 'media-input-image', ariaLabel: 'Input image' },
}

export const NUMERIC_PARAM_TYPES = new Set(['int', 'float', 'seed'])
export const CHOICE_PARAM_TYPES = new Set(['enum', 'resolution'])
export const TEXTUAL_PARAM_TYPES = new Set([
  'string',
  'image_ref',
  'audio_ref',
  'stringlist',
])

export function mediaParamDomId(spec: MediaParamSpec): string {
  return WELL_KNOWN[spec.id]?.domId ?? `media-${spec.id}`
}

export function mediaParamLabel(spec: MediaParamSpec): string {
  return WELL_KNOWN[spec.id]?.ariaLabel ?? spec.label ?? spec.id
}

/** Does this build know how to draw a control for this spec at all? */
export function isRenderableParam(spec: MediaParamSpec): boolean {
  return (
    NUMERIC_PARAM_TYPES.has(spec.type) ||
    CHOICE_PARAM_TYPES.has(spec.type) ||
    TEXTUAL_PARAM_TYPES.has(spec.type) ||
    spec.type === 'text' ||
    spec.type === 'bool'
  )
}

/**
 * The width and height behind a chosen `resolution`.
 *
 * A resolution is one control whose single wire value expands into two request
 * values, so this is how a caller performs that expansion without parsing a
 * label.
 */
export function resolutionSizeOf(
  spec: MediaParamSpec,
  value: unknown
): { width: number; height: number } | undefined {
  const option = (spec.options ?? []).find(
    (candidate) => String(candidate.value) === String(value)
  )
  if (!option || option.width === undefined || option.height === undefined) {
    return undefined
  }
  return { width: option.width, height: option.height }
}

/** The documented order. Anything else sorts after these, alphabetically. */
export const MEDIA_PARAM_GROUP_ORDER = [
  'core',
  'output',
  'sampling',
  'motion',
  'advanced',
]

export const DEFAULT_PARAM_GROUP = 'core'

function groupRank(group: string): number {
  const index = MEDIA_PARAM_GROUP_ORDER.indexOf(group)
  return index === -1 ? MEDIA_PARAM_GROUP_ORDER.length : index
}

export function compareParamGroups(a: string, b: string): number {
  const rank = groupRank(a) - groupRank(b)
  // Both unknown: alphabetical, which at least makes the result stable.
  return rank !== 0 ? rank : a.localeCompare(b)
}

export function compareParamSpecs(a: MediaParamSpec, b: MediaParamSpec): number {
  const order =
    (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)
  // Id as the final tiebreak: two specs with the same order must not swap
  // places between renders.
  return order !== 0 ? order : a.id.localeCompare(b.id)
}
