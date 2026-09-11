import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AtomicMediaCapabilities } from '@/services/atomicMedia/types'

import fixture from '../../contract/__tests__/fixtures/worker-v1-capabilities.json'
import type { MediaJobState, MediaProviderDescriptor } from '../../contract'
import { createAtomicWorkerAdapter } from '../atomicWorker'
import {
  describeMediaAdapterConformance,
  type ConformanceScenarios,
} from './conformance'

const v1 = fixture.payload as AtomicMediaCapabilities

const descriptor: MediaProviderDescriptor = {
  id: 'atomic-media-worker',
  label: 'Radium Media Worker',
  kind: 'local_worker',
  adapter: 'atomic-media-worker',
  base_url: 'http://127.0.0.1:19999',
  auth: { type: 'none' },
  enabled: true,
  origin: 'builtin',
}

// --- mock transport ---------------------------------------------------------
// The worker speaks HTTP, so the transport under the adapter is `fetch`, stubbed
// the same way the existing AtomicMediaClient tests stub it.

type TransportState = {
  reachable: boolean
  providerJobId: string
  states: MediaJobState[]
  lastSignal?: AbortSignal
  calls: number
  urls: string[]
  bodies: unknown[]
}

let state: TransportState

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** v1 wire snapshot for the next reported state. */
function wireSnapshot(): Response {
  const next = state.states.length > 1 ? state.states.shift() : state.states[0]
  const status = next === 'cancelled' ? 'failed' : next
  return json({
    job_id: state.providerJobId,
    status,
    ...(next === 'failed'
      ? { error: 'CUDA out of memory while decoding frame 3' }
      : {}),
    ...(next === 'succeeded'
      ? { output_path: 'D:\\Media\\out\\clip.mp4' }
      : {}),
    ...(next === 'queued' ? { queue_position: 2, jobs_ahead: 1 } : {}),
    ...(next === 'running' ? { progress: 42 } : {}),
  })
}

beforeEach(() => {
  state = {
    reachable: true,
    providerJobId: 'provider-job-1',
    states: ['queued'],
    calls: 0,
    urls: [],
    bodies: [],
  }

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      state.calls += 1
      state.urls.push(String(input))
      state.lastSignal = init?.signal ?? undefined
      if (init?.body) state.bodies.push(JSON.parse(String(init.body)))

      if (!state.reachable) throw new TypeError('fetch failed')

      const url = String(input)
      if (url.endsWith('/health')) {
        return json({ service: 'atomic-media', version: '0.4.1', status: 'ok' })
      }
      if (url.endsWith('/capabilities')) return json(v1)
      if (url.endsWith('/jobs') && init?.method === 'POST') {
        return json({ job_id: state.providerJobId, status: 'queued' })
      }
      if (url.includes('/jobs/')) return wireSnapshot()

      return json({ error: 'unexpected path' }, 404)
    })
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const scenarios: ConformanceScenarios = {
  online() {
    state.reachable = true
  },
  unreachable() {
    state.reachable = false
  },
  unauthorised() {
    // The local worker has no auth at all, so there is no unauthorised state to
    // reach. Declared, not silently skipped.
    return false
  },
  capabilities() {
    state.reachable = true
  },
  acceptsSubmit(providerJobId: string) {
    state.reachable = true
    state.providerJobId = providerJobId
  },
  jobStates(states: MediaJobState[]) {
    state.states = [...states]
  },
  synchronous() {
    // Job-based: the worker creates a job and is polled for it.
    return false
  },
  lastSignal() {
    return state.lastSignal
  },
  callCount() {
    return state.calls
  },
}

describeMediaAdapterConformance({
  name: 'Radium Media Worker',
  descriptor,
  createAdapter: createAtomicWorkerAdapter,
  scenarios,
})

// --- worker-specific behaviour ---------------------------------------------
// Anything asserted here is true of THIS adapter only. Behaviour every adapter
// must share belongs in the conformance suite instead.

describe('createAtomicWorkerAdapter', () => {
  it('talks to the base_url from its descriptor, not a compiled-in default', async () => {
    await createAtomicWorkerAdapter(descriptor).health()

    expect(state.urls[0]).toBe('http://127.0.0.1:19999/health')
  })

  it('upcasts a v1 capabilities payload rather than rejecting it', async () => {
    const capabilities = await createAtomicWorkerAdapter(
      descriptor
    ).capabilities()

    expect(capabilities.contract_version).toBe(2)
    expect(capabilities.models[0]?.id).toBe('atomic-media-worker:registry-video')
    // v1 reality: it cannot cancel and cannot stream.
    expect(capabilities.features?.cancel).toBe(false)
    expect(capabilities.features?.events).toBe(false)
  })

  it('uses a v2 payload directly when the worker already speaks v2', async () => {
    const adapter = createAtomicWorkerAdapter(descriptor)
    vi.mocked(fetch).mockImplementationOnce(
      async () =>
        json({
          contract_version: 2,
          provider_id: 'ignored-by-adapter',
          devices: [],
          models: [
            {
              id: 'atomic-media-worker:native',
              provider_id: 'atomic-media-worker',
              local_id: 'native',
              label: 'Native v2',
              tasks: ['text_to_image'],
              params: { text_to_image: [] },
            },
          ],
          features: { cancel: true },
        }) as Response
    )

    const capabilities = await adapter.capabilities()

    expect(capabilities.models[0]?.local_id).toBe('native')
  })

  it('refuses a contract version newer than this build understands', async () => {
    const adapter = createAtomicWorkerAdapter(descriptor)
    vi.mocked(fetch).mockImplementationOnce(
      async () => json({ contract_version: 99, models: [] }) as Response
    )

    // Never partially parse a future contract - plan section 5.2.
    await expect(adapter.capabilities()).rejects.toThrow(/newer/i)
  })

  it('submits the downcast v1 body, not the v2 params bag', async () => {
    const adapter = createAtomicWorkerAdapter(descriptor)
    const capabilities = await adapter.capabilities()
    const model = capabilities.models[0]!

    await adapter.submit({
      client_job_id: '01JWORKER0000000000000000',
      provider_id: descriptor.id,
      model_id: model.id,
      task: 'text_to_video',
      params: {
        prompt: 'a red car',
        resolution: '832x480',
        num_frames: 17,
        fps: 12,
        steps: 10,
        guidance_scale: 5,
      },
      device: 'cuda:0',
    })

    expect(state.bodies[0]).toEqual({
      kind: 'text_to_video',
      prompt: 'a red car',
      device: 'cuda:0',
      model_id: 'registry-video',
      width: 832,
      height: 480,
      steps: 10,
      guidance_scale: 5,
      num_frames: 17,
      fps: 12,
    })
  })

  it('reattaches client_job_id on polls, which the v1 worker never echoes', async () => {
    const adapter = createAtomicWorkerAdapter(descriptor)
    const capabilities = await adapter.capabilities()
    const model = capabilities.models[0]!
    const submitted = await adapter.submit({
      client_job_id: '01JWORKER0000000000000000',
      provider_id: descriptor.id,
      model_id: model.id,
      task: 'text_to_video',
      params: { prompt: 'p', resolution: '832x480' },
    })

    state.states = ['running']
    // Poll with only the provider id, as a job manager restoring state would.
    const snapshot = await adapter.poll({
      client_job_id: submitted.client_job_id,
      provider_job_id: submitted.provider_job_id,
    })

    expect(snapshot.client_job_id).toBe('01JWORKER0000000000000000')
    expect(snapshot.provider_job_id).toBe('provider-job-1')
  })

  it('maps a succeeded job to a local_path output', async () => {
    const adapter = createAtomicWorkerAdapter(descriptor)
    state.states = ['succeeded']

    const snapshot = await adapter.poll({
      client_job_id: 'c1',
      provider_job_id: 'provider-job-1',
    })

    expect(snapshot.state).toBe('succeeded')
    expect(snapshot.outputs).toEqual([
      { kind: 'local_path', path: 'D:\\Media\\out\\clip.mp4' },
    ])
  })

  it('surfaces queue position and progress the worker reports', async () => {
    const adapter = createAtomicWorkerAdapter(descriptor)
    state.states = ['queued']
    const queued = await adapter.poll({
      client_job_id: 'c1',
      provider_job_id: 'provider-job-1',
    })
    state.states = ['running']
    const running = await adapter.poll({
      client_job_id: 'c1',
      provider_job_id: 'provider-job-1',
    })

    expect(queued.queue_position).toBe(2)
    expect(running.progress).toBe(42)
  })

  it('does not offer cancel, because the v1 worker has no cancel endpoint', () => {
    // C11 is fixed by admitting the gap rather than pretending to cancel.
    expect(createAtomicWorkerAdapter(descriptor).cancel).toBeUndefined()
  })

  it('reports offline with detail when the worker is not running', async () => {
    state.reachable = false

    const health = await createAtomicWorkerAdapter(descriptor).health()

    expect(health.state).toBe('offline')
    expect(health.detail).toMatch(/unavailable/i)
  })

  it('reports the worker service and version when online', async () => {
    const health = await createAtomicWorkerAdapter(descriptor).health()

    expect(health).toMatchObject({
      state: 'online',
      service: 'atomic-media',
      version: '0.4.1',
    })
  })

  it('treats a missing capabilities endpoint as an empty v2 payload', async () => {
    const adapter = createAtomicWorkerAdapter(descriptor)
    vi.mocked(fetch).mockImplementationOnce(
      async () => json({ error: 'not found' }, 404) as Response
    )

    const capabilities = await adapter.capabilities()

    expect(capabilities.contract_version).toBe(2)
    expect(capabilities.models).toEqual([])
  })
})
