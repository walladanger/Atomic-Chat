/**
 * Resolves a provider descriptor to a live adapter.
 *
 * The single place that knows which adapter implementations exist. Everything
 * else - the store, the job manager, the UI - works with the descriptor and the
 * `MediaProviderAdapter` interface, so adding a provider means adding one case
 * here and nothing else.
 */

import { createAtomicWorkerAdapter } from './adapters/atomicWorker'
import type { MediaProviderAdapter, MediaProviderDescriptor } from './contract'

export class UnknownMediaAdapterError extends Error {
  constructor(readonly descriptor: MediaProviderDescriptor) {
    super(
      `No media adapter is bundled for "${descriptor.adapter}" ` +
        `(provider "${descriptor.id}").`
    )
    this.name = 'UnknownMediaAdapterError'
  }
}

export function createMediaAdapter(
  descriptor: MediaProviderDescriptor
): MediaProviderAdapter {
  switch (descriptor.adapter) {
    case 'atomic-media-worker':
      return createAtomicWorkerAdapter(descriptor)
    // 'comfyui' arrives in Task 5, 'openai-images' / 'custom-http' in Task 6.
    default:
      // Thrown rather than returning a null adapter: a provider configured
      // against an adapter this build does not have is a state the settings UI
      // must surface, not silently treat as offline.
      throw new UnknownMediaAdapterError(descriptor)
  }
}
