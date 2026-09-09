/**
 * Declared ComfyUI workflow templates, and the derivation of contract models
 * and parameter schemas from them.
 *
 * ComfyUI has no concept of a "model" the way the media contract does. It
 * describes *nodes* - `GET /object_info` returns every registered node class
 * with its input types and bounds - and a job is an arbitrary graph of them.
 * Nothing in that surface says which graphs are meaningful, so an adapter that
 * tried to infer a model list would be guessing.
 *
 * This module resolves that by inverting it: the platform declares a small set
 * of workflow templates, each of which *is* one `MediaModelDescriptor`, and
 * `/object_info` is consulted only to (a) confirm every node class a template
 * needs actually exists on that server and (b) derive the parameter schema for
 * the inputs the template chooses to expose. A template whose nodes or inputs
 * are missing is not surfaced at all. The platform never submits a graph it did
 * not declare.
 *
 * Recorded surface (T05-S01, read 2026-09-09 against
 * github.com/comfyanonymous/ComfyUI@master, `comfyui_version.py`
 * `__version__ = "0.35.0"`):
 *
 *   GET /object_info -> { [class_name]: { input: { required?, optional?,
 *     hidden? }, input_order, output, output_is_list, output_name, name,
 *     display_name, description, python_module, category, output_node, ... } }
 *
 * where each input entry is the tuple `[type, config]`, `type` being either a
 * type name (`"INT"`, `"FLOAT"`, `"BOOLEAN"`, `"STRING"`, or a link type such
 * as `"MODEL"`/`"LATENT"`) or, for a combo widget, the array of permitted
 * values. `config` carries `default`, `min`, `max`, `step`, `round`,
 * `multiline` and `tooltip`. The tuple is sometimes length 1 - `("LATENT",)` in
 * Python - so `config` must be treated as optional.
 */

import type {
  MediaModelDescriptor,
  MediaOutputMediaType,
  MediaParamOption,
  MediaParamSpec,
  MediaTaskId,
} from '../contract'
import { MEDIA_TASK } from '../contract'

// --- the ComfyUI wire, as read from /object_info -----------------------------

/** `[type, config]`, where a combo's `type` is the array of its values. */
export type ComfyInputDefinition = [
  string | Array<string | number>,
  Record<string, unknown>?,
]

export type ComfyNodeInfo = {
  input?: {
    required?: Record<string, ComfyInputDefinition>
    optional?: Record<string, ComfyInputDefinition>
    hidden?: Record<string, unknown>
  }
  display_name?: string
  description?: string
  category?: string
  output_node?: boolean
}

export type ComfyObjectInfo = Record<string, ComfyNodeInfo>

/** One node in a prompt graph. Links are `[node_id, output_index]`. */
export type ComfyGraphNode = {
  class_type: string
  inputs: Record<string, unknown>
  _meta?: { title?: string }
}

export type ComfyGraph = Record<string, ComfyGraphNode>

// --- the declaration ---------------------------------------------------------

/**
 * One exposed knob: a contract parameter id bound to a single input on a single
 * node of the template's graph.
 *
 * The binding is per *node*, not per class, which is what lets one template
 * expose the same input of two different `KSampler` nodes under two different
 * contract ids (`steps` and `hires_steps`).
 */
export type ComfyTemplateInput = {
  /** Contract param id. This is the wire name in the v2 params bag. */
  id: string
  /** Graph node the input belongs to. */
  node: string
  /** Input name on that node, spelled as `/object_info` spells it. */
  input: string
  /**
   * Applied on top of whatever was derived from `/object_info`. Presentation
   * (`label`, `group`, `order`, `advanced`) plus the few cases where the
   * platform knows better than the raw node config - `seed` is an `INT` widget
   * to ComfyUI but a `seed` to the contract.
   */
  spec?: Partial<Omit<MediaParamSpec, 'id'>>
}

export type ComfyWorkflowTemplate = {
  /** Local model id. Provider-qualified by the adapter. */
  local_id: string
  label: string
  description: string
  task: MediaTaskId
  output_media_type: MediaOutputMediaType
  /**
   * The graph submitted to `POST /prompt`, with every exposed input already
   * holding a usable value. `submit` overwrites only the exposed ones.
   */
  graph: ComfyGraph
  inputs: ComfyTemplateInput[]
  /** The `output_node` whose `/history` entry carries the result files. */
  output_node: string
}

const SHARED_PROMPT_SPEC: Partial<Omit<MediaParamSpec, 'id'>> = {
  label: 'Prompt',
  group: 'core',
  order: 1,
  required: true,
  widget: 'textarea',
}

const SHARED_NEGATIVE_SPEC: Partial<Omit<MediaParamSpec, 'id'>> = {
  label: 'Negative prompt',
  group: 'core',
  order: 2,
  widget: 'textarea',
}

/**
 * Text to image. The stock ComfyUI default graph: checkpoint -> two text
 * encodes -> empty latent -> sampler -> VAE decode -> save.
 */
const TXT2IMG: ComfyWorkflowTemplate = {
  local_id: 'txt2img',
  label: 'Text to image',
  description:
    'Checkpoint, prompt, empty latent, one sampling pass, save. The stock ComfyUI text-to-image graph.',
  task: MEDIA_TASK.TEXT_TO_IMAGE,
  output_media_type: 'image',
  output_node: '7',
  graph: {
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: '' },
    },
    '2': {
      class_type: 'CLIPTextEncode',
      inputs: { text: '', clip: ['1', 1] },
      _meta: { title: 'Positive prompt' },
    },
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: { text: '', clip: ['1', 1] },
      _meta: { title: 'Negative prompt' },
    },
    '4': {
      class_type: 'EmptyLatentImage',
      inputs: { width: 512, height: 512, batch_size: 1 },
    },
    '5': {
      class_type: 'KSampler',
      inputs: {
        seed: 0,
        steps: 20,
        cfg: 8,
        sampler_name: 'euler',
        scheduler: 'simple',
        denoise: 1,
        model: ['1', 0],
        positive: ['2', 0],
        negative: ['3', 0],
        latent_image: ['4', 0],
      },
    },
    '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
    '7': {
      class_type: 'SaveImage',
      inputs: { images: ['6', 0], filename_prefix: 'AtomicChat' },
    },
  },
  inputs: [
    { id: 'prompt', node: '2', input: 'text', spec: SHARED_PROMPT_SPEC },
    {
      id: 'negative_prompt',
      node: '3',
      input: 'text',
      spec: SHARED_NEGATIVE_SPEC,
    },
    {
      id: 'checkpoint',
      node: '1',
      input: 'ckpt_name',
      spec: { label: 'Checkpoint', group: 'core', order: 3, required: true },
    },
    { id: 'width', node: '4', input: 'width', spec: { group: 'output', order: 1 } },
    {
      id: 'height',
      node: '4',
      input: 'height',
      spec: { group: 'output', order: 2 },
    },
    {
      id: 'batch_size',
      node: '4',
      input: 'batch_size',
      spec: { group: 'output', order: 3, advanced: true },
    },
    {
      id: 'seed',
      node: '5',
      input: 'seed',
      // ComfyUI models a seed as a plain INT widget. The contract has a `seed`
      // type, which is what gives the UI its randomise affordance and lets an
      // empty value mean "pick one".
      spec: { type: 'seed', label: 'Seed', group: 'sampling', order: 1 },
    },
    { id: 'steps', node: '5', input: 'steps', spec: { group: 'sampling', order: 2 } },
    {
      id: 'cfg',
      node: '5',
      input: 'cfg',
      spec: { label: 'CFG scale', group: 'sampling', order: 3 },
    },
    {
      id: 'sampler_name',
      node: '5',
      input: 'sampler_name',
      spec: { label: 'Sampler', group: 'sampling', order: 4 },
    },
    {
      id: 'scheduler',
      node: '5',
      input: 'scheduler',
      spec: { group: 'sampling', order: 5 },
    },
    {
      id: 'denoise',
      node: '5',
      input: 'denoise',
      spec: { group: 'sampling', order: 6, advanced: true },
    },
  ],
}

/**
 * Text to image with a latent upscale and a second sampling pass.
 *
 * Declared as a separate template rather than as flags on the first: the graph
 * genuinely differs, and it is what proves the derivation is per-node - `steps`
 * and `hires_steps` are the same `KSampler` input on two different nodes.
 */
const TXT2IMG_HIRES: ComfyWorkflowTemplate = {
  local_id: 'txt2img-hires',
  label: 'Text to image (hi-res pass)',
  description:
    'The text-to-image graph plus a latent upscale and a second, lighter sampling pass.',
  task: MEDIA_TASK.TEXT_TO_IMAGE,
  output_media_type: 'image',
  output_node: '7',
  graph: {
    ...TXT2IMG.graph,
    '8': {
      class_type: 'LatentUpscale',
      inputs: {
        samples: ['5', 0],
        upscale_method: 'nearest-exact',
        width: 1024,
        height: 1024,
        crop: 'disabled',
      },
    },
    '9': {
      class_type: 'KSampler',
      inputs: {
        seed: 0,
        steps: 10,
        cfg: 8,
        sampler_name: 'euler',
        scheduler: 'simple',
        denoise: 0.5,
        model: ['1', 0],
        positive: ['2', 0],
        negative: ['3', 0],
        latent_image: ['8', 0],
      },
    },
    // The decode reads the second pass, not the first.
    '6': { class_type: 'VAEDecode', inputs: { samples: ['9', 0], vae: ['1', 2] } },
  },
  inputs: [
    ...TXT2IMG.inputs,
    {
      id: 'hires_width',
      node: '8',
      input: 'width',
      spec: { label: 'Hi-res width', group: 'output', order: 4 },
    },
    {
      id: 'hires_height',
      node: '8',
      input: 'height',
      spec: { label: 'Hi-res height', group: 'output', order: 5 },
    },
    {
      id: 'upscale_method',
      node: '8',
      input: 'upscale_method',
      spec: { label: 'Upscale method', group: 'output', order: 6 },
    },
    {
      id: 'hires_steps',
      node: '9',
      input: 'steps',
      spec: { label: 'Hi-res steps', group: 'sampling', order: 7 },
    },
    {
      id: 'hires_denoise',
      node: '9',
      input: 'denoise',
      spec: { label: 'Hi-res denoise', group: 'sampling', order: 8 },
    },
  ],
}

/** Every template this build declares. Nothing else may be submitted. */
export const COMFY_WORKFLOW_TEMPLATES: ComfyWorkflowTemplate[] = [
  TXT2IMG,
  TXT2IMG_HIRES,
]

// --- derivation --------------------------------------------------------------

const SCALAR_TYPES = new Set(['INT', 'FLOAT', 'BOOLEAN', 'STRING'])

/** Input types that carry data between nodes and can never be a UI control. */
function isLinkType(type: string): boolean {
  return type === type.toUpperCase() && !SCALAR_TYPES.has(type)
}

function definitionOf(
  node: ComfyNodeInfo,
  input: string
): ComfyInputDefinition | undefined {
  return node.input?.required?.[input] ?? node.input?.optional?.[input]
}

function numberOrUndefined(raw: unknown): number | undefined {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined
}

/**
 * ComfyUI states a seed's ceiling as 2^64-1, which JSON cannot carry and
 * JavaScript cannot represent. Capping at `Number.MAX_SAFE_INTEGER` is the
 * largest honest bound: a value above it would not survive the round trip
 * through `JSON.stringify` intact, so the job would run on a seed the user
 * never chose.
 */
function safeMax(raw: unknown): number | undefined {
  const max = numberOrUndefined(raw)
  if (max === undefined) return undefined
  return Math.min(max, Number.MAX_SAFE_INTEGER)
}

/**
 * One `/object_info` input tuple to one `MediaParamSpec`, or `undefined` when
 * the input cannot be a control at all (a link type, or an input this server's
 * build of the node does not have).
 */
export function deriveParamSpec(
  declared: ComfyTemplateInput,
  node: ComfyNodeInfo
): MediaParamSpec | undefined {
  const definition = definitionOf(node, declared.input)
  if (!definition) return undefined

  const [type, rawConfig] = definition
  const config = rawConfig ?? {}
  const help = typeof config.tooltip === 'string' ? config.tooltip : undefined

  let base: MediaParamSpec | undefined

  if (Array.isArray(type)) {
    const options: MediaParamOption[] = type.map((value) => ({ value }))
    base = {
      id: declared.id,
      type: 'enum',
      options,
      default: config.default ?? options[0]?.value,
      widget: 'select',
    }
  } else if (type === 'INT' || type === 'FLOAT') {
    base = {
      id: declared.id,
      type: type === 'INT' ? 'int' : 'float',
      min: numberOrUndefined(config.min),
      max: safeMax(config.max),
      step: numberOrUndefined(config.step),
      default: numberOrUndefined(config.default),
    }
  } else if (type === 'BOOLEAN') {
    base = {
      id: declared.id,
      type: 'bool',
      default: typeof config.default === 'boolean' ? config.default : false,
      widget: 'switch',
    }
  } else if (type === 'STRING') {
    base = {
      id: declared.id,
      type: config.multiline === true ? 'text' : 'string',
      // No `default` unless the node declares one. Inventing an empty string
      // would make a required prompt look satisfied to anything that checks
      // only for presence.
      ...(typeof config.default === 'string' ? { default: config.default } : {}),
    }
  } else if (isLinkType(type)) {
    // A template asking to expose MODEL or LATENT is a bug in the template, not
    // in the server. Refusing here means the template is dropped rather than
    // rendered as an uneditable control.
    return undefined
  } else {
    base = { id: declared.id, type: 'string' }
  }

  const spec: MediaParamSpec = {
    ...base,
    ...(help ? { help } : {}),
    // Presentation and the few deliberate overrides win over the node config.
    ...declared.spec,
    id: declared.id,
  }

  // A `seed` keeps the numeric bounds it was derived from but never a default
  // of 0: that would silently pin every generation to the same noise.
  if (spec.type === 'seed' && declared.spec?.default === undefined) {
    delete spec.default
  }

  return spec
}

export type DerivedModel = {
  template: ComfyWorkflowTemplate
  descriptor: MediaModelDescriptor
}

/**
 * Every declared template this server can actually run, as contract models.
 *
 * A template is dropped when a node class it uses is absent or when one of its
 * exposed inputs is not on that node. Both mean the server's build differs from
 * what the template was written against, and submitting the graph anyway would
 * fail validation at `POST /prompt` after the user had already waited.
 */
export function deriveModels(
  objectInfo: ComfyObjectInfo,
  providerId: string,
  templates: ComfyWorkflowTemplate[] = COMFY_WORKFLOW_TEMPLATES
): DerivedModel[] {
  const derived: DerivedModel[] = []

  for (const template of templates) {
    const classes = Object.values(template.graph).map((node) => node.class_type)
    if (classes.some((className) => !objectInfo[className])) continue

    const specs: MediaParamSpec[] = []
    let complete = true
    for (const declared of template.inputs) {
      const className = template.graph[declared.node]?.class_type
      const info = className ? objectInfo[className] : undefined
      const spec = info ? deriveParamSpec(declared, info) : undefined
      if (!spec) {
        complete = false
        break
      }
      specs.push(spec)
    }
    if (!complete) continue

    // An enum with no values means the server has the node but nothing to feed
    // it - almost always an install with no checkpoints. The model is still
    // listed, because hiding it would leave the user with an empty provider and
    // no explanation, but it is marked unrunnable.
    const empty = specs.filter(
      (spec) => spec.type === 'enum' && (spec.options?.length ?? 0) === 0
    )

    derived.push({
      template,
      descriptor: {
        id: `${providerId}:${template.local_id}`,
        provider_id: providerId,
        local_id: template.local_id,
        label: template.label,
        tasks: [template.task],
        params: { [template.task]: specs },
        outputs: {
          [template.task]: { media_type: template.output_media_type },
        },
        install: { installed: true, installable: false },
        ...(empty.length > 0
          ? {
              fitness: {
                status: 'unsupported' as const,
                reason: `This ComfyUI install has no values for ${empty
                  .map((spec) => spec.id)
                  .join(', ')}.`,
              },
            }
          : {}),
      },
    })
  }

  return derived
}
