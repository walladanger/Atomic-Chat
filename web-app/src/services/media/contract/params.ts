/**
 * Media contract v2 — the parameter specification and its validator.
 *
 * `MediaParamSpec` is the keystone type: it subsumes v1's `supports` booleans,
 * its fixed request struct, and its three bespoke constraint shapes
 * (`resolutions`, `frame_rule`, `ranges`) into one declarative description a
 * renderer can walk. `validateParams` is the only behaviour in this module —
 * pure, total, and free of I/O and React.
 */

export type MediaParamType =
  | 'string' // single-line
  | 'text' // multi-line (prompt, negative prompt)
  | 'int'
  | 'float'
  | 'bool'
  | 'enum'
  | 'seed' // int + "randomise" affordance + empty = random
  | 'resolution' // paired w/h, rendered as one control
  | 'image_ref' // local path or library asset id
  | 'audio_ref'
  | 'stringlist' // e.g. LoRA names

/** Value must satisfy `value % modulus === offset`. Generalises `frame_rule`. */
export type MediaParamModulus = {
  modulus: number
  offset: number
}

export type MediaParamOption = {
  value: string | number
  label?: string
  label_key?: string
  /** For type `resolution` only. */
  width?: number
  height?: number
}

/** Conditional visibility. All clauses must hold for the param to be shown. */
export type MediaParamDependency = {
  param: string
  equals?: unknown
  in?: unknown[]
  truthy?: boolean
}

export type MediaParamSpec = {
  /** Wire name. Sent verbatim in the request params bag. */
  id: string

  type: MediaParamType

  /** i18n key preferred; `label` is the provider's untranslated fallback. */
  label_key?: string
  label?: string
  help_key?: string
  help?: string

  /** Layout. Unknown groups render after known ones, alphabetically. */
  group?: 'core' | 'output' | 'sampling' | 'motion' | 'advanced' | string
  order?: number
  /** Collapsed behind "Advanced" by default. */
  advanced?: boolean

  required?: boolean
  default?: unknown

  // Numeric constraints — apply to int / float / seed.
  min?: number
  max?: number
  /** Cosmetic increment for the control. Not enforced by `validateParams`. */
  step?: number
  modulus?: MediaParamModulus

  // enum / resolution
  options?: MediaParamOption[]

  // string / text
  max_length?: number
  placeholder_key?: string

  // image_ref / audio_ref
  accept?: string[] // mime types

  depends_on?: MediaParamDependency[]

  /** Cosmetic hint only; never load-bearing. */
  widget?: 'slider' | 'input' | 'select' | 'radio' | 'switch' | 'textarea'
}

export type MediaParamValidationErrorCode =
  | 'required'
  | 'invalid_type'
  | 'not_an_option'
  | 'max_length'

export type MediaParamValidationError = {
  param: string
  code: MediaParamValidationErrorCode
  /** Untranslated, developer-facing. UI copy comes from the code + spec. */
  message: string
}

type MediaParamValidationOutcome = {
  /** Validated bag, ready for `NormalizedMediaRequest.params`. */
  values: Record<string, unknown>
  errors: MediaParamValidationError[]
}

export type MediaParamValidationResult =
  | ({ ok: true } & MediaParamValidationOutcome)
  | ({ ok: false } & MediaParamValidationOutcome)

/** A coerced value, a deliberate absence, or a rejection. Never a throw. */
type Coerced =
  | { kind: 'value'; value: unknown }
  | { kind: 'absent' }
  | { kind: 'error'; code: MediaParamValidationErrorCode; message: string }

const ABSENT: Coerced = { kind: 'absent' }

function isBlank(raw: unknown): boolean {
  if (raw === undefined || raw === null) return true
  return typeof raw === 'string' && raw.trim() === ''
}

function clamp(value: number, min?: number, max?: number): number {
  let next = value
  if (typeof min === 'number' && Number.isFinite(min)) next = Math.max(min, next)
  if (typeof max === 'number' && Number.isFinite(max)) next = Math.min(max, next)
  return next
}

/**
 * Snap `value` onto the nearest number satisfying `v % modulus === offset`,
 * then re-clamp. Lifted from v1's `nearestFrame` (MediaGenerationForm) and
 * generalised from frames to any numeric param.
 *
 * Ties break *downwards* (`<=` on the lower distance), matching v1 exactly so
 * the Task 2 parity test can assert a byte-identical submitted payload. With
 * `{modulus: 4, offset: 1}` that means 19 snaps to 17, not 21.
 */
function quantise(
  value: number,
  rule: MediaParamModulus,
  min?: number,
  max?: number
): number {
  const bounded = clamp(value, min, max)
  if (!Number.isFinite(rule.modulus) || rule.modulus <= 0) return bounded
  const offset = Number.isFinite(rule.offset) ? rule.offset : 0
  const base = bounded - offset
  const lower = Math.floor(base / rule.modulus) * rule.modulus + offset
  const upper = Math.ceil(base / rule.modulus) * rule.modulus + offset
  const nearest =
    Math.abs(bounded - lower) <= Math.abs(upper - bounded) ? lower : upper
  return clamp(nearest, min, max)
}

function coerceNumber(spec: MediaParamSpec, raw: unknown): Coerced {
  if (typeof raw === 'boolean' || typeof raw === 'object') {
    return {
      kind: 'error',
      code: 'invalid_type',
      message: `"${spec.id}" expects a ${spec.type}`,
    }
  }
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) {
    return {
      kind: 'error',
      code: 'invalid_type',
      message: `"${spec.id}" expects a ${spec.type}, received ${String(raw)}`,
    }
  }
  const rounded = spec.type === 'float' ? parsed : Math.round(parsed)
  const value = spec.modulus
    ? quantise(rounded, spec.modulus, spec.min, spec.max)
    : clamp(rounded, spec.min, spec.max)
  return { kind: 'value', value }
}

function coerceBool(spec: MediaParamSpec, raw: unknown): Coerced {
  if (typeof raw === 'boolean') return { kind: 'value', value: raw }
  if (raw === 1 || raw === 0) return { kind: 'value', value: raw === 1 }
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase()
    if (normalized === 'true' || normalized === '1') {
      return { kind: 'value', value: true }
    }
    if (normalized === 'false' || normalized === '0') {
      return { kind: 'value', value: false }
    }
  }
  return {
    kind: 'error',
    code: 'invalid_type',
    message: `"${spec.id}" expects a boolean`,
  }
}

/**
 * enum and resolution are both membership over `options`. A resolution's
 * `width`/`height` ride along on the option for the renderer and for the v1
 * downcaster; the wire value stays the option's own `value`.
 */
function coerceOption(spec: MediaParamSpec, raw: unknown): Coerced {
  const options = spec.options ?? []
  const comparable =
    typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean'
  const match = comparable
    ? options.find(
        (option) => option.value === raw || String(option.value) === String(raw)
      )
    : undefined
  if (!match) {
    return {
      kind: 'error',
      code: 'not_an_option',
      message: `"${spec.id}" does not accept ${String(raw)}`,
    }
  }
  return { kind: 'value', value: match.value }
}

function coerceString(spec: MediaParamSpec, raw: unknown): Coerced {
  let value: string
  if (typeof raw === 'string') value = raw
  else if (typeof raw === 'number' || typeof raw === 'boolean') value = String(raw)
  else {
    return {
      kind: 'error',
      code: 'invalid_type',
      message: `"${spec.id}" expects a string`,
    }
  }
  if (typeof spec.max_length === 'number' && value.length > spec.max_length) {
    return {
      kind: 'error',
      code: 'max_length',
      message: `"${spec.id}" exceeds max_length ${spec.max_length}`,
    }
  }
  return { kind: 'value', value }
}

function coerceStringList(spec: MediaParamSpec, raw: unknown): Coerced {
  if (Array.isArray(raw)) {
    return {
      kind: 'value',
      value: raw.filter((entry): entry is string => typeof entry === 'string'),
    }
  }
  if (typeof raw === 'string') return { kind: 'value', value: [raw] }
  return {
    kind: 'error',
    code: 'invalid_type',
    message: `"${spec.id}" expects a string or an array of strings`,
  }
}

function coerce(spec: MediaParamSpec, raw: unknown): Coerced {
  // An empty seed means "randomise", not zero: the value is simply omitted so
  // the provider picks one. Keeping the validator pure rules out generating a
  // seed here.
  if (isBlank(raw)) return ABSENT

  switch (spec.type) {
    case 'int':
    case 'float':
    case 'seed':
      return coerceNumber(spec, raw)
    case 'bool':
      return coerceBool(spec, raw)
    case 'enum':
    case 'resolution':
      return coerceOption(spec, raw)
    case 'stringlist':
      return coerceStringList(spec, raw)
    case 'image_ref':
    case 'audio_ref':
    case 'string':
    case 'text':
    default:
      return coerceString(spec, raw)
  }
}

function clauseHolds(clause: MediaParamDependency, effective: unknown): boolean {
  if ('equals' in clause && effective !== clause.equals) return false
  if (
    Array.isArray(clause.in) &&
    !clause.in.some((candidate) => candidate === effective)
  ) {
    return false
  }
  if (typeof clause.truthy === 'boolean' && Boolean(effective) !== clause.truthy) {
    return false
  }
  // A clause with no predicate constrains nothing rather than hiding the param.
  return true
}

/**
 * Validate a values bag against a parameter schema.
 *
 * Total: never throws, whatever the shape of `specs` or `values`. Returns a
 * result discriminated on `ok`, the validated bag, and every error found (not
 * just the first).
 *
 * Behaviour worth knowing:
 * - Numbers are clamped to `min`/`max` and snapped by `modulus`; that is
 *   correction, not an error.
 * - `enum`/`resolution` membership failures are errors, never silent fallbacks.
 * - Keys with no matching spec are dropped, not forwarded.
 * - A param hidden by `depends_on` is excluded from the output and is never
 *   reported as missing, even when `required`.
 * - An absent or empty `seed` is omitted so the provider randomises.
 */
/**
 * Which specs are currently visible, given the values entered so far.
 *
 * Exported because a renderer has to decide what to draw and `validateParams`
 * has to decide what to submit, and those two answers must never disagree. A
 * second implementation of `depends_on` in the UI would drift from this one the
 * first time either changed.
 */
export function visibleParams(
  specs: MediaParamSpec[],
  values: Record<string, unknown>
): MediaParamSpec[] {
  const safeSpecs = Array.isArray(specs) ? specs : []
  const { isVisible } = resolveVisibility(safeSpecs, values)
  return safeSpecs.filter(
    (spec) => spec && typeof spec.id === 'string' && isVisible(spec)
  )
}

/** Coerce every spec, then resolve `depends_on` against the typed results. */
function resolveVisibility(
  safeSpecs: MediaParamSpec[],
  values: Record<string, unknown>
) {
  const safeValues =
    values && typeof values === 'object' ? values : ({} as Record<string, unknown>)

  const byId = new Map<string, MediaParamSpec>()
  for (const spec of safeSpecs) {
    if (spec && typeof spec.id === 'string') byId.set(spec.id, spec)
  }

  // Coerce everything first, ignoring visibility, so `depends_on` can be
  // evaluated against typed values in any spec order.
  const coerced = new Map<string, Coerced>()
  for (const spec of byId.values()) {
    // `undefined`/`null` means "not supplied", so the default applies. An empty
    // string does not: a field the user deliberately cleared must not be
    // silently repopulated (and for a seed, cleared means "randomise").
    const supplied = safeValues[spec.id]
    coerced.set(spec.id, coerce(spec, supplied ?? spec.default))
  }

  const visibility = new Map<string, boolean>()
  const resolving = new Set<string>()

  const effectiveValue = (id: string): unknown => {
    const outcome = coerced.get(id)
    if (outcome?.kind === 'value') return outcome.value
    if (outcome) return undefined
    // No spec for this id: fall back to the raw supplied value.
    return safeValues[id]
  }

  const isVisible = (spec: MediaParamSpec): boolean => {
    const cached = visibility.get(spec.id)
    if (cached !== undefined) return cached
    // A dependency cycle is a malformed schema; hide rather than recurse.
    if (resolving.has(spec.id)) return false
    resolving.add(spec.id)

    let visible = true
    for (const clause of spec.depends_on ?? []) {
      if (!clause || typeof clause.param !== 'string') continue
      const parent = byId.get(clause.param)
      if (parent && !isVisible(parent)) {
        visible = false
        break
      }
      if (!clauseHolds(clause, effectiveValue(clause.param))) {
        visible = false
        break
      }
    }

    resolving.delete(spec.id)
    visibility.set(spec.id, visible)
    return visible
  }

  return { byId, coerced, isVisible }
}

export function validateParams(
  specs: MediaParamSpec[],
  values: Record<string, unknown>
): MediaParamValidationResult {
  const safeSpecs = Array.isArray(specs) ? specs : []
  const { coerced, isVisible } = resolveVisibility(safeSpecs, values)

  const output: Record<string, unknown> = {}
  const errors: MediaParamValidationError[] = []

  for (const spec of safeSpecs) {
    if (!spec || typeof spec.id !== 'string') continue
    if (!isVisible(spec)) continue

    const outcome = coerced.get(spec.id) ?? ABSENT
    if (outcome.kind === 'value') {
      output[spec.id] = outcome.value
      continue
    }
    if (outcome.kind === 'error') {
      errors.push({
        param: spec.id,
        code: outcome.code,
        message: outcome.message,
      })
      continue
    }
    // Absent. A seed left empty is a legitimate "randomise", so it never
    // trips `required`.
    if (spec.required && spec.type !== 'seed') {
      errors.push({
        param: spec.id,
        code: 'required',
        message: `"${spec.id}" is required`,
      })
    }
  }

  return errors.length === 0
    ? { ok: true, values: output, errors }
    : { ok: false, values: output, errors }
}
