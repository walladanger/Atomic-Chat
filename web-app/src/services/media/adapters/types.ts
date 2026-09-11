/**
 * Adapter-layer types.
 *
 * The adapter interface itself lives in the contract (`contract/jobs.ts`) - an
 * adapter is one implementation of it. What belongs here is how adapters are
 * *constructed*, so the registry in Task 4 can build one from a descriptor
 * without knowing which provider it is.
 */

import type {
  MediaJobHandle,
  MediaJobSnapshot,
  MediaProviderAdapter,
  MediaProviderDescriptor,
} from '../contract'

/**
 * Builds an adapter for one configured provider. Every adapter module exports
 * a factory with this shape, which is what makes the registry provider-agnostic
 * and what the conformance suite is parameterised over.
 */
export type MediaAdapterFactory = (
  descriptor: MediaProviderDescriptor
) => MediaProviderAdapter

/**
 * A job handle plus the state an adapter needs to keep about it locally.
 *
 * v1 workers do not echo the caller's `client_job_id`, so an adapter has to
 * remember the mapping itself and reattach it to every snapshot. Without this
 * the caller cannot correlate a poll result with the job it submitted.
 */
export type MediaJobCorrelation = {
  client_job_id: string
  provider_job_id?: string
}

/** Reattach the caller's `client_job_id` to a snapshot built from the wire. */
export function withClientJobId(
  snapshot: Omit<MediaJobSnapshot, 'client_job_id'> & {
    client_job_id?: string
  },
  handle: MediaJobHandle
): MediaJobSnapshot {
  return { ...snapshot, client_job_id: handle.client_job_id }
}
