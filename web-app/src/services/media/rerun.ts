/**
 * A generation handed from the library to the studio.
 *
 * The library knows WHAT to run again; the studio knows HOW to run it. This is
 * the one-item handover between them.
 *
 * Deliberately a module-level slot rather than router state or a store:
 *  - it is consumed exactly once, immediately after navigation, and then gone,
 *    so persisting it would only create a stale "re-run" waiting to ambush the
 *    user on some later visit;
 *  - it must not go in the URL, because params include the full prompt.
 *
 * NOTE FOR WHOEVER WIRES THE STUDIO SIDE: nothing consumes this yet.
 * `MediaStudio.tsx` is frozen by the selective v2.0.32 protected surface, so
 * reading this slot there needs a guard re-baseline and the user's explicit
 * authorisation (decision Q1). Until that happens the library's "Re-run"
 * buttons navigate to Media but the form does not repopulate itself. Recorded
 * as decision D17 rather than left as a silent dead end.
 */

export type PendingMediaReRun = {
  provider_id: string
  model_id: string
  task: string
  params: Record<string, unknown>
}

let pending: PendingMediaReRun | undefined

export function setPendingMediaReRun(request: PendingMediaReRun) {
  pending = request
}

/**
 * Take the pending re-run, if there is one. Reading CLEARS it: a re-run is a
 * one-shot instruction, and leaving it in place would re-apply itself the next
 * time the studio mounted.
 */
export function takePendingMediaReRun(): PendingMediaReRun | undefined {
  const request = pending
  pending = undefined
  return request
}

/** Test seam, and a way for a route to abandon a handover it did not use. */
export function clearPendingMediaReRun() {
  pending = undefined
}
