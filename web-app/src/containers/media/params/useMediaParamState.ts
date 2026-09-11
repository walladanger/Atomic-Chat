/**
 * The values behind a schema-driven form.
 *
 * Generalises the `useEffect` at `MediaGenerationForm.tsx:138-178`, which
 * re-applies a model's defaults by hand, one `setState` per knob, against a
 * fixed struct. Here the same job is done against whatever specs the provider
 * announced.
 *
 * The one behaviour worth being deliberate about is *when* correction happens.
 * Clamping and quantising run on blur, never on change: correcting mid-keystroke
 * means a user typing "120" watches it become "1", then "12". v1 got this right
 * and the parity test in Task 2 depends on the tie-breaking staying identical.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  validateParams,
  visibleParams,
  type MediaParamSpec,
  type MediaParamValidationResult,
} from '@/services/media/contract'

export type UseMediaParamState = {
  values: Record<string, unknown>
  /** Specs currently visible, after `depends_on`. */
  visibleSpecs: MediaParamSpec[]
  /** The validated bag plus any errors. Recomputed on every change. */
  validated: MediaParamValidationResult
  setValue: (id: string, value: unknown) => void
  /** Clamp and quantise this field. Call from the control's blur handler. */
  blur: (id: string) => void
  /** Discard everything and re-apply the schema's defaults. */
  reset: () => void
}

function defaultsFor(specs: MediaParamSpec[]): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const spec of specs) {
    if (spec?.default !== undefined) values[spec.id] = spec.default
  }
  return values
}

/**
 * Identity of a schema, for deciding when to re-apply defaults.
 *
 * Specs arrive as a fresh array on every render, so reference equality would
 * reset the form constantly. What actually matters is whether the *shape*
 * changed, which is what a model or task switch does.
 */
function schemaKey(specs: MediaParamSpec[]): string {
  return specs
    .map((spec) => `${spec.id}:${spec.type}:${String(spec.default)}`)
    .join('|')
}

export function useMediaParamState(
  specs: MediaParamSpec[],
  initial?: Record<string, unknown>
): UseMediaParamState {
  const key = schemaKey(specs)
  const [values, setValues] = useState<Record<string, unknown>>(() => ({
    ...defaultsFor(specs),
    ...initial,
  }))
  const previousKey = useRef(key)

  useEffect(() => {
    if (previousKey.current === key) return
    previousKey.current = key
    // A model switch starts from that model's defaults. Carrying values across
    // would leave a number that was valid for the old model silently out of
    // range for the new one.
    setValues(defaultsFor(specs))
  }, [key, specs])

  const setValue = useCallback((id: string, value: unknown) => {
    setValues((current) => ({ ...current, [id]: value }))
  }, [])

  const blur = useCallback(
    (id: string) => {
      const spec = specs.find((candidate) => candidate.id === id)
      if (!spec) return

      setValues((current) => {
        // validateParams already clamps and quantises, so correction reuses it
        // rather than reimplementing `nearestFrame`. One implementation, one
        // tie-breaking rule, and the Task 2 parity test keeps covering both.
        const corrected = validateParams([spec], { [id]: current[id] })
        if (!(id in corrected.values)) return current
        return { ...current, [id]: corrected.values[id] }
      })
    },
    [specs]
  )

  const reset = useCallback(() => setValues(defaultsFor(specs)), [specs])

  const validated = useMemo(() => validateParams(specs, values), [specs, values])
  const visibleSpecs = useMemo(() => visibleParams(specs, values), [specs, values])

  return { values, visibleSpecs, validated, setValue, blur, reset }
}
