/**
 * v1 -> v2 translation, and back.
 *
 * This is the keystone of the whole platform plan: it lets contract v2 land
 * against today's unmodified Atomic Media Worker. A user on the current worker
 * sees an identical form with identical controls, driven by a completely
 * different mechanism.
 *
 * Both functions are total - unknown v1 fields are ignored, never thrown on -
 * because a worker is an external process this build does not control.
 *
 * This module is the one place in `contract/` allowed to know about v1 types.
 * They move into the worker adapter in Task 3.
 */

import type {
  AtomicMediaCapabilities,
  AtomicMediaJobKind,
  AtomicMediaJobRequest,
  AtomicMediaModel,
  AtomicMediaNumericRange,
} from '@/services/atomicMedia/types'

import type { NormalizedMediaRequest } from './jobs'
import type { MediaCapabilities, MediaModelDescriptor } from './models'
import type { MediaParamSpec } from './params'
import type { MediaOutputMediaType, MediaTaskId } from './tasks'

/** v1 had no i18n, so the upcaster carries the form's own English labels as
 * provider fallbacks. Task 13 introduces `label_key`s; until then these keep
 * the rendered UI text identical, which is what the parity test asserts. */
const LABEL = {
  prompt: 'Prompt',
  negative_prompt: 'Negative prompt',
  input_image: 'Reference image path',
  resolution: 'Resolution',
  steps: 'Steps',
  guidance_scale: 'Guidance',
  num_frames: 'Frames',
  fps: 'FPS',
  seed: 'Seed',
} as const

const OUTPUT_MEDIA_TYPE: Record<string, MediaOutputMediaType> = {
  text_to_image: 'image',
  image_to_image: 'image',
  upscale: 'image',
  inpaint: 'image',
  outpaint: 'image',
  text_to_video: 'video',
  image_to_video: 'video',
  interpolate: 'video',
  text_to_audio: 'audio',
  text_to_speech: 'audio',
}

function outputMediaType(task: MediaTaskId): MediaOutputMediaType {
  return OUTPUT_MEDIA_TYPE[task] ?? 'unknown'
}

function isVideoTask(task: MediaTaskId): boolean {
  return outputMediaType(task) === 'video'
}

function takesInputImage(task: MediaTaskId): boolean {
  return task === 'image_to_video' || task === 'image_to_image'
}

function clamp(value: number, min?: number, max?: number): number {
  let next = Number.isFinite(value) ? value : (min ?? 0)
  if (typeof min === 'number') next = Math.max(min, next)
  if (typeof max === 'number') next = Math.min(max, next)
  return next
}

/**
 * The v1 form seeds a numeric control with `clamp(default ?? 0, min, max)`, so
 * a model that declares a range but no default effectively defaults to the
 * range's minimum. Reproducing that here is what keeps the submitted body
 * identical for such a model.
 */
function numericDefault(
  supplied: number | undefined,
  range: AtomicMediaNumericRange | undefined
): number | undefined {
  if (typeof supplied === 'number') return clamp(supplied, range?.min, range?.max)
  if (!range) return undefined
  return clamp(0, range.min, range.max)
}

function resolutionSpec(model: AtomicMediaModel): MediaParamSpec | undefined {
  const resolutions = model.resolutions ?? []
  if (!resolutions.length) return undefined

  const options = resolutions.map((item) => ({
    value: `${item.width}x${item.height}`,
    // Matches the form's option text exactly, multiplication sign included.
    label: `${item.width} × ${item.height}`,
    width: item.width,
    height: item.height,
  }))

  // The form prefers the resolution matching `defaults`, else the first one.
  const preferred =
    resolutions.find(
      (item) =>
        item.width === model.defaults?.width &&
        item.height === model.defaults?.height
    ) ?? resolutions[0]

  return {
    id: 'resolution',
    type: 'resolution',
    group: 'output',
    label: LABEL.resolution,
    ...(preferred
      ? { default: `${preferred.width}x${preferred.height}` }
      : {}),
    options,
  }
}

function paramsForTask(
  model: AtomicMediaModel,
  task: MediaTaskId
): MediaParamSpec[] {
  const specs: MediaParamSpec[] = []
  const supports = model.supports ?? {}
  const defaults = model.defaults ?? {}
  const ranges = model.ranges ?? {}
  const video = isVideoTask(task)

  // --- core ---------------------------------------------------------------
  // v1 typed `prompt` as a required string, so every model gets one.
  specs.push({
    id: 'prompt',
    type: 'text',
    group: 'core',
    label: LABEL.prompt,
    required: true,
  })

  if (supports.negative_prompt) {
    specs.push({
      id: 'negative_prompt',
      type: 'text',
      group: 'core',
      label: LABEL.negative_prompt,
    })
  }

  if (supports.input_image && takesInputImage(task)) {
    specs.push({
      id: 'input_image',
      type: 'image_ref',
      group: 'core',
      label: LABEL.input_image,
      required: true,
    })
  }

  // --- output -------------------------------------------------------------
  const resolution = resolutionSpec(model)
  if (resolution) specs.push(resolution)

  // --- sampling -----------------------------------------------------------
  const steps = numericDefault(defaults.steps, ranges.steps)
  if (ranges.steps || defaults.steps) {
    specs.push({
      id: 'steps',
      type: 'int',
      group: 'sampling',
      label: LABEL.steps,
      ...(ranges.steps ? { min: ranges.steps.min, max: ranges.steps.max } : {}),
      ...(steps === undefined ? {} : { default: steps }),
    })
  }

  const guidance = numericDefault(
    defaults.guidance_scale,
    ranges.guidance_scale
  )
  if (ranges.guidance_scale || defaults.guidance_scale) {
    specs.push({
      id: 'guidance_scale',
      type: 'float',
      group: 'sampling',
      label: LABEL.guidance_scale,
      ...(ranges.guidance_scale
        ? { min: ranges.guidance_scale.min, max: ranges.guidance_scale.max }
        : {}),
      step: 0.1,
      ...(guidance === undefined ? {} : { default: guidance }),
    })
  }

  // --- motion (video tasks only) -----------------------------------------
  if (video && model.frame_rule) {
    const rule = model.frame_rule
    specs.push({
      id: 'num_frames',
      type: 'int',
      group: 'motion',
      label: LABEL.num_frames,
      min: rule.min,
      max: rule.max,
      modulus: { modulus: rule.modulus, offset: rule.offset },
      default: defaults.num_frames ?? rule.min,
    })
  } else if (video && typeof defaults.num_frames === 'number') {
    // No frame rule to honour, but the model still states a frame count.
    specs.push({
      id: 'num_frames',
      type: 'int',
      group: 'motion',
      label: LABEL.num_frames,
      default: defaults.num_frames,
    })
  }

  if (video && (ranges.fps || defaults.fps)) {
    const fps = numericDefault(defaults.fps, ranges.fps)
    specs.push({
      id: 'fps',
      type: 'int',
      group: 'motion',
      label: LABEL.fps,
      ...(ranges.fps ? { min: ranges.fps.min, max: ranges.fps.max } : {}),
      ...(fps === undefined ? {} : { default: fps }),
    })
  }

  // --- advanced -----------------------------------------------------------
  if (supports.seed) {
    specs.push({
      id: 'seed',
      type: 'seed',
      group: 'advanced',
      label: LABEL.seed,
      advanced: true,
    })
  }

  return specs
}

function modelDescriptor(
  model: AtomicMediaModel,
  providerId: string
): MediaModelDescriptor | undefined {
  const tasks = (model.kinds ?? []).filter(
    (kind): kind is AtomicMediaJobKind => typeof kind === 'string'
  )
  // A model that claims no task cannot be selected or submitted, so emitting it
  // would only put a dead entry in front of the user.
  if (!tasks.length) return undefined

  const params: Record<MediaTaskId, MediaParamSpec[]> = {}
  const outputs: NonNullable<MediaModelDescriptor['outputs']> = {}
  for (const task of tasks) {
    params[task] = paramsForTask(model, task)
    outputs[task] = { media_type: outputMediaType(task) }
  }

  return {
    id: `${providerId}:${model.id}`,
    provider_id: providerId,
    local_id: model.id,
    label: model.label,
    ...(model.repo ? { repo: model.repo } : {}),
    tasks,
    params,
    install: { installed: model.installed !== false, installable: false },
    ...(model.fitness ? { fitness: { ...model.fitness } } : {}),
    outputs,
  } as MediaModelDescriptor
}

/**
 * Translate a v1 capabilities payload into contract v2.
 *
 * Total: any field it does not recognise is ignored rather than rejected, and a
 * malformed or empty payload yields an empty-but-valid v2 payload.
 */
export function upcastV1Capabilities(
  payload: AtomicMediaCapabilities,
  providerId = 'atomic-media-worker'
): MediaCapabilities {
  const safe = payload && typeof payload === 'object' ? payload : undefined
  const models: MediaModelDescriptor[] = []
  for (const model of safe?.models ?? []) {
    if (!model || typeof model.id !== 'string') continue
    const descriptor = modelDescriptor(model, providerId)
    if (descriptor) models.push(descriptor)
  }

  const tasks = [...new Set(models.flatMap((model) => model.tasks))].map(
    (task) => ({ id: task, output_media_type: outputMediaType(task) })
  )

  return {
    contract_version: 2,
    provider_id: providerId,
    devices: (safe?.devices ?? []).map((device) => ({ ...device })),
    models,
    ...(tasks.length ? { tasks } : {}),
    ...(safe?.recommended?.length
      ? {
          recommended: safe.recommended.map((entry) => ({
            task: entry.kind,
            model_id: `${providerId}:${entry.model_id}`,
          })),
        }
      : {}),
    // v1 reality, not aspiration: it polls, it queues, and it cannot cancel.
    features: {
      cancel: false,
      progress: true,
      queue: true,
      events: false,
      install: false,
      batch: false,
    },
  }
}

/** Every param id a v1 worker can actually accept. */
const V1_PARAM_IDS = new Set([
  'prompt',
  'negative_prompt',
  'input_image',
  'resolution',
  'steps',
  'guidance_scale',
  'num_frames',
  'fps',
  'seed',
])

function dimensions(
  value: unknown,
  model?: MediaModelDescriptor
): { width?: number; height?: number } {
  if (typeof value !== 'string') return {}
  for (const specs of Object.values(model?.params ?? {})) {
    const option = specs
      .find((spec) => spec.id === 'resolution')
      ?.options?.find((entry) => entry.value === value)
    if (option?.width && option?.height) {
      return { width: option.width, height: option.height }
    }
  }
  // Fall back to the `WxH` wire form the id itself carries.
  const [width, height] = value.split('x').map(Number)
  return Number.isFinite(width) && Number.isFinite(height)
    ? { width, height }
    : {}
}

function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

function localModelId(
  req: NormalizedMediaRequest,
  model?: MediaModelDescriptor
): string {
  if (model?.local_id) return model.local_id
  const marker = req.model_id.indexOf(':')
  return marker === -1 ? req.model_id : req.model_id.slice(marker + 1)
}

/**
 * Serialise a v2 request back into a flat v1 job body.
 *
 * Key insertion order deliberately matches the object literal in
 * MediaGenerationForm's `submit`, so `JSON.stringify` of the two is identical -
 * that byte-identity is the acceptance test for plan section 5.1.
 *
 * Params a v1 worker cannot accept are dropped with one `console.warn` naming
 * the provider and the dropped keys. Silently succeeding with settings other
 * than the ones the user chose is the worse failure.
 */
export function downcastV2Request(
  req: NormalizedMediaRequest,
  model?: MediaModelDescriptor
): AtomicMediaJobRequest {
  const params = req.params ?? {}
  const { width, height } = dimensions(params.resolution, model)

  const body: AtomicMediaJobRequest = {
    kind: req.task as AtomicMediaJobKind,
    prompt: text(params.prompt) ?? '',
    ...(req.device ? { device: req.device } : {}),
    model_id: localModelId(req, model),
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
    ...(typeof params.steps === 'number' ? { steps: params.steps } : {}),
    ...(typeof params.guidance_scale === 'number'
      ? { guidance_scale: params.guidance_scale }
      : {}),
    ...(text(params.negative_prompt)
      ? { negative_prompt: text(params.negative_prompt) }
      : {}),
    ...(typeof params.seed === 'number' ? { seed: params.seed } : {}),
    ...(typeof params.num_frames === 'number'
      ? { num_frames: params.num_frames }
      : {}),
    ...(typeof params.fps === 'number' ? { fps: params.fps } : {}),
    ...(text(params.input_image)
      ? { input_image: text(params.input_image) }
      : {}),
  }

  const dropped = Object.keys(params).filter((key) => !V1_PARAM_IDS.has(key))
  if (dropped.length) {
    console.warn(
      `[media] provider "${req.provider_id}" speaks contract v1 and cannot accept ` +
        `these parameters, so they were dropped: ${dropped.join(', ')}`
    )
  }

  return body
}
