/**
 * `useMediaGeneration` tests.
 *
 * The point of this hook is what it does NOT do: it holds no job state. These
 * tests are therefore mostly about unmounting - the exact thing that used to
 * destroy a running job (coupling C10, `useAtomicMediaJob.ts:33`).
 */

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  MediaCapabilities,
  MediaJobSnapshot,
  MediaProviderAdapter,
  MediaProviderDescriptor,
  NormalizedMediaRequest,
} from '@/services/media/contract'
import {
  MEDIA_POLL_BACKOFF_MS,
  createMediaJobManager,
  type MediaJobManager,
} from '@/services/media/jobManager'
import { useMediaGeneration } from './useMediaGeneration'

const descriptor: MediaProviderDescriptor = {
  id: 'worker',
  label: 'Radium Media Worker',
  kind: 'local_worker',
  adapter: 'atomic-media-worker',
  enabled: true,
  origin: 'builtin',
}

const request: NormalizedMediaRequest = {
  client_job_id: '01JHOOKJOB000000000000000',
  provider_id: 'worker',
  model_id: 'worker:model',
  task: 'text_to_image',
  params: { prompt: 'a red car' },
}

function snapshot(state: MediaJobSnapshot['state']): MediaJobSnapshot {
  return {
    client_job_id: request.client_job_id,
    provider_job_id: 'worker-job',
    provider_id: 'worker',
    state,
    outputs: [],
    error: null,
  }
}

function capabilities(
  features: MediaCapabilities['features']
): MediaCapabilities {
  return {
    contract_version: 2,
    provider_id: 'worker',
    devices: [],
    models: [],
    features,
  }
}

function build(
  states: MediaJobSnapshot['state'][],
  features: MediaCapabilities['features'] = {}
): { manager: MediaJobManager; poll: ReturnType<typeof vi.fn> } {
  const queue = [...states]
  const poll = vi.fn(async () =>
    snapshot(
      (queue.length > 1 ? queue.shift() : queue[0]) as MediaJobSnapshot['state']
    )
  )
  const adapter: MediaProviderAdapter = {
    descriptor,
    health: async () => ({ state: 'online' }),
    capabilities: async () => capabilities(features),
    submit: async () => snapshot('queued'),
    poll,
    ...(features.cancel ? { cancel: vi.fn(async () => {}) } : {}),
  }
  const manager = createMediaJobManager({
    createAdapter: () => adapter,
    providers: () => [descriptor],
    capabilitiesFor: () => capabilities(features),
  })
  return { manager, poll }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useMediaGeneration', () => {
  it('exposes jobs the manager already had before the hook mounted', async () => {
    const { manager } = build(['running'])
    await manager.submit(request)

    const { result } = renderHook(() => useMediaGeneration(manager))

    expect(result.current.jobs).toHaveLength(1)
    expect(result.current.latest?.client_job_id).toBe(request.client_job_id)
  })

  it('re-renders when the manager updates a job', async () => {
    const { manager } = build(['running', 'succeeded'])
    const { result } = renderHook(() => useMediaGeneration(manager))

    await act(async () => {
      await manager.submit(request)
    })
    expect(result.current.latest?.state).toBe('queued')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(MEDIA_POLL_BACKOFF_MS[0]!)
    })
    expect(result.current.latest?.state).toBe('running')
  })

  it('keeps the job running across an unmount and shows it again on remount', async () => {
    // This is the C10 regression. The old hook held the job in useState, so
    // leaving the Media route destroyed the UI's only record of work that was
    // still occupying the GPU.
    const { manager, poll } = build(['running', 'running', 'succeeded'])
    const first = renderHook(() => useMediaGeneration(manager))

    await act(async () => {
      await manager.submit(request)
    })
    first.unmount()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })

    // Polling never stopped...
    expect(poll.mock.calls.length).toBeGreaterThan(1)
    // ...and the finished job is there when the user comes back.
    const second = renderHook(() => useMediaGeneration(manager))
    expect(second.result.current.latest?.state).toBe('succeeded')
  })

  it('delegates submit to the manager rather than tracking its own copy', async () => {
    const { manager } = build(['running'])
    const spy = vi.spyOn(manager, 'submit')
    const { result } = renderHook(() => useMediaGeneration(manager))

    await act(async () => {
      await result.current.submit(request)
    })

    expect(spy).toHaveBeenCalledWith(request)
    expect(result.current.jobs).toHaveLength(1)
  })

  it('reports cancellability from the provider, not from the snapshot', async () => {
    const capable = build(['running'], { cancel: true })
    const incapable = build(['running'], { cancel: false })
    await capable.manager.submit(request)
    await incapable.manager.submit(request)

    const yes = renderHook(() => useMediaGeneration(capable.manager))
    const no = renderHook(() => useMediaGeneration(incapable.manager))

    expect(yes.result.current.canCancel(request.client_job_id)).toBe(true)
    expect(no.result.current.canCancel(request.client_job_id)).toBe(false)
  })

  it('cancels through the manager and reflects the new state', async () => {
    const { manager } = build(['running'], { cancel: true })
    const { result } = renderHook(() => useMediaGeneration(manager))
    await act(async () => {
      await manager.submit(request)
    })

    await act(async () => {
      await result.current.cancel(request.client_job_id)
    })

    expect(result.current.latest?.state).toBe('cancelled')
  })

  it('looks a job up by its client job id', async () => {
    const { manager } = build(['running'])
    await manager.submit(request)
    const { result } = renderHook(() => useMediaGeneration(manager))

    expect(result.current.job(request.client_job_id)?.provider_id).toBe('worker')
    expect(result.current.job('01JNOSUCHJOB00000000000000')).toBeUndefined()
  })
})
