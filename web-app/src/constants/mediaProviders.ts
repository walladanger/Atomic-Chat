/**
 * The bundled media-provider baseline.
 *
 * Exactly one entry: the local Atomic Media Worker every existing user already
 * points at. That is deliberate — it means shipping multi-provider support
 * changes nothing for anyone who has not asked for a second provider, and needs
 * no data migration (there is no persisted Media state today).
 *
 * Task 15 may later feed additional entries from the remote registry; those
 * arrive with `origin: 'registry'` and never overwrite a user's own edits.
 */

import type { MediaProviderDescriptor } from '@/services/media/contract'

export const ATOMIC_MEDIA_WORKER_PROVIDER_ID = 'atomic-media-worker'

export const BASELINE_MEDIA_PROVIDERS: MediaProviderDescriptor[] = [
  {
    id: ATOMIC_MEDIA_WORKER_PROVIDER_ID,
    label: 'Atomic Media Worker',
    kind: 'local_worker',
    adapter: 'atomic-media-worker',
    base_url: 'http://127.0.0.1:13420',
    // A worker on the loopback interface has nothing to authenticate with.
    auth: { type: 'none' },
    enabled: true,
    origin: 'builtin',
    order: 0,
  },
]
