/**
 * ComfyUI adapter tests.
 *
 * Fixture-driven, never live (plan Task 5 Step 2). The fixtures under
 * `fixtures/` were transcribed from the ComfyUI source at the version their
 * `_source` block names, not captured from a running server and not inferred
 * from a client library - `AGENTS.md` §6.2. `_source.trimmed` says exactly what
 * was left out of each one.
 *
 * The suite this file exists to run is `describeMediaAdapterConformance`, which
 * is imported unmodified. Everything after it is ComfyUI-specific behaviour that
 * no other adapter is required to share.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MediaJobState, MediaProviderDescriptor } from '../../contract'
import { createComfyUiAdapter } from '../comfyui'
import type { ComfyObjectInfo } from '../comfyWorkflows'
import objectInfoFixture from './fixtures/comfyui-object-info.json'
import systemStatsFixture from './fixtures/comfyui-system-stats.json'
import {
  describeMediaAdapterConformance,
  type ConformanceScenarios,
} from './conformance'

const OBJECT_INFO = objectInfoFixture as unknown as ComfyObjectInfo

const descriptor: MediaProviderDescriptor = {
  id: 'comfyui-local',
  label: 'ComfyUI',
  kind: 'local_comfy',
  adapter: 'comfyui',
  base_url: 'http://127.0.0.1:8188',
  // Core ComfyUI ships no authentication at all. The adapter still maps 401/403
  // for a reverse-proxied install; that is asserted separately below.
  auth: { type: 'none' },
  enabled: true,
  origin: 'builtin',
}

// --- mock transport ---------------------------------------------------------

type TransportState = {
  reachable: boolean
  /** Status returned by every request when set. Used for the 401 mapping. */
  forcedStatus?: number
  promptId: string
  states: MediaJobState[]
  current: MediaJobState
  submitStatus: number
  submitBody?: unknown
  /** Force both queue tables empty, whatever the scripted state says. */
  absentFromQueue: boolean
  objectInfo: ComfyObjectInfo
  lastSignal?: AbortSignal
  calls: number
  urls: string[]
  methods: (string | undefined)[]
  bodies: unknown[]
}

let state: TransportState

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** Advance the scripted job states, repeating the last one forever. */
function nextState(): MediaJobState {
  const next =
    state.states.length > 1
      ? (state.states.shift() as MediaJobState)
      : (state.states[0] as MediaJobState)
  state.current = next
  return next
}

const SUCCESS_ENTRY = {
  outputs: {
    '7': {
      images: [
        { filename: 'AtomicChat_00001_.png', subfolder: '', type: 'output' },
      ],
    },
  },
  status: {
    status_str: 'success',
    completed: true,
    messages: [
      ['execution_start', { prompt_id: 'prompt-1' }],
      ['execution_success', { prompt_id: 'prompt-1' }],
    ],
  },
}

const FAILURE_ENTRY = {
  outputs: {},
  status: {
    status_str: 'error',
    completed: false,
    messages: [
      ['execution_start', { prompt_id: 'prompt-1' }],
      [
        'execution_error',
        {
          prompt_id: 'prompt-1',
          node_id: '5',
          node_type: 'KSampler',
          exception_type: 'torch.OutOfMemoryError',
          exception_message: 'Allocation on device 0 would exceed allowed memory',
        },
      ],
    ],
  },
}

/**
 * An interrupted prompt. `main.py` records `status_str: 'error'` for it - the
 * only signal that the user cancelled rather than the graph blowing up is the
 * `execution_interrupted` entry in `messages`.
 */
const INTERRUPTED_ENTRY = {
  outputs: {},
  status: {
    status_str: 'error',
    completed: false,
    messages: [
      ['execution_start', { prompt_id: 'prompt-1' }],
      [
        'execution_interrupted',
        { prompt_id: 'prompt-1', node_id: '5', node_type: 'KSampler', executed: [] },
      ],
    ],
  },
}

function historyResponse(): Response {
  const next = nextState()
  if (next === 'succeeded') return json({ [state.promptId]: SUCCESS_ENTRY })
  if (next === 'failed') return json({ [state.promptId]: FAILURE_ENTRY })
  if (next === 'cancelled') return json({ [state.promptId]: INTERRUPTED_ENTRY })
  // Queued and running leave no history entry at all.
  return json({})
}

function queueResponse(): Response {
  if (state.absentFromQueue) {
    return json({ queue_running: [], queue_pending: [] })
  }
  if (state.current === 'running') {
    return json({
      queue_running: [[1, state.promptId, {}, {}, []]],
      queue_pending: [],
    })
  }
  if (state.current === 'queued') {
    return json({
      queue_running: [],
      queue_pending: [
        [0, 'someone-elses-prompt', {}, {}, []],
        [1, state.promptId, {}, {}, []],
      ],
    })
  }
  return json({ queue_running: [], queue_pending: [] })
}

// --- mock WebSocket ---------------------------------------------------------

class FakeWebSocket {
  static instances: FakeWebSocket[] = []

  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null
  readonly sent: string[] = []
  closed = false

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.closed = true
  }

  // --- test drivers ---
  static get last(): FakeWebSocket {
    const socket = FakeWebSocket.instances.at(-1)
    if (!socket) throw new Error('no WebSocket was opened')
    return socket
  }

  open() {
    this.onopen?.()
  }

  emit(type: string, data: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify({ type, data }) })
  }

  emitRaw(data: unknown) {
    this.onmessage?.({ data })
  }

  fail() {
    this.onerror?.()
  }
}

beforeEach(() => {
  state = {
    reachable: true,
    promptId: 'prompt-1',
    states: ['queued'],
    current: 'queued',
    submitStatus: 200,
    absentFromQueue: false,
    objectInfo: OBJECT_INFO,
    calls: 0,
    urls: [],
    methods: [],
    bodies: [],
  }

  FakeWebSocket.instances = []
  vi.stubGlobal('WebSocket', FakeWebSocket)

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      state.calls += 1
      state.urls.push(String(input))
      state.methods.push(init?.method)
      state.lastSignal = init?.signal ?? undefined
      if (init?.body) state.bodies.push(JSON.parse(String(init.body)))

      if (!state.reachable) throw new TypeError('fetch failed')
      if (state.forcedStatus) {
        return json({ error: 'denied' }, state.forcedStatus)
      }

      const url = String(input)
      if (url.endsWith('/system_stats')) return json(systemStatsFixture)
      if (url.endsWith('/object_info')) return json(state.objectInfo)
      if (url.endsWith('/prompt') && init?.method === 'POST') {
        if (state.submitStatus !== 200) {
          return json(state.submitBody, state.submitStatus)
        }
        return json({
          prompt_id: state.promptId,
          number: 3,
          node_errors: {},
        })
      }
      if (url.includes('/history/')) return historyResponse()
      if (url.endsWith('/interrupt')) return json({})
      if (url.endsWith('/queue')) {
        if (init?.method === 'POST') return json({})
        return queueResponse()
      }

      return json({ error: 'unexpected path' }, 404)
    })
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const scenarios: ConformanceScenarios = {
  online() {
    state.reachable = true
    state.forcedStatus = undefined
  },
  unreachable() {
    state.reachable = false
  },
  unauthorised() {
    // Core ComfyUI has no auth to fail. Declared inapplicable rather than
    // silently skipped; the 401 mapping is covered by its own test below.
    return false
  },
  capabilities() {
    state.reachable = true
    state.forcedStatus = undefined
    state.objectInfo = OBJECT_INFO
  },
  acceptsSubmit(providerJobId: string) {
    state.reachable = true
    state.forcedStatus = undefined
    state.submitStatus = 200
    state.promptId = providerJobId
    state.states = ['queued']
    state.current = 'queued'
  },
  jobStates(states: MediaJobState[]) {
    state.states = [...states]
  },
  lastSignal() {
    return state.lastSignal
  },
  callCount() {
    return state.calls
  },
}

describeMediaAdapterConformance({
  name: 'ComfyUI',
  descriptor,
  createAdapter: createComfyUiAdapter,
  scenarios,
})

// --- ComfyUI-specific behaviour ---------------------------------------------

/** Submit a job and return the adapter plus the resulting handle. */
async function submitted(adapter = createComfyUiAdapter(descriptor)) {
  const capabilities = await adapter.capabilities()
  const model = capabilities.models[0]!
  const snapshot = await adapter.submit({
    client_job_id: '01JCOMFY00000000000000000',
    provider_id: descriptor.id,
    model_id: model.id,
    task: 'text_to_image',
    params: { prompt: 'a red car', checkpoint: 'v1-5-pruned-emaonly.safetensors', seed: 7 },
  })
  return { adapter, snapshot }
}

describe('createComfyUiAdapter — health', () => {
  it('reports the ComfyUI version from /system_stats', async () => {
    const health = await createComfyUiAdapter(descriptor).health()

    expect(health).toMatchObject({
      state: 'online',
      service: 'comfyui',
      version: '0.35.0',
    })
    expect(state.urls[0]).toBe('http://127.0.0.1:8188/system_stats')
  })

  it('maps 401 to unauthorised, for a reverse-proxied install', async () => {
    state.forcedStatus = 401

    const health = await createComfyUiAdapter(descriptor).health()

    expect(health.state).toBe('unauthorised')
  })

  it('reports offline with a detail when ComfyUI is not running', async () => {
    state.reachable = false

    const health = await createComfyUiAdapter(descriptor).health()

    expect(health).toMatchObject({ state: 'offline' })
    expect(health.detail).toBeTruthy()
  })
})

describe('createComfyUiAdapter — capabilities', () => {
  it('surfaces one model per declared template, provider-qualified', async () => {
    const capabilities = await createComfyUiAdapter(descriptor).capabilities()

    expect(capabilities.models.map((model) => model.local_id)).toEqual([
      'txt2img',
      'txt2img-hires',
    ])
    expect(capabilities.models[0]?.id).toBe('comfyui-local:txt2img')
  })

  it('declares cancel, events and queue, which the worker could not', async () => {
    const capabilities = await createComfyUiAdapter(descriptor).capabilities()

    expect(capabilities.features).toMatchObject({
      cancel: true,
      events: true,
      queue: true,
      install: false,
    })
  })

  it('derives numeric bounds from /object_info rather than hardcoding them', async () => {
    const capabilities = await createComfyUiAdapter(descriptor).capabilities()
    const specs = capabilities.models[0]!.params['text_to_image']!
    const width = specs.find((spec) => spec.id === 'width')

    expect(width).toMatchObject({
      type: 'int',
      min: 16,
      max: 16384,
      step: 8,
      default: 512,
    })
  })

  it('derives an enum from a combo widget, keeping the server’s own values', async () => {
    const capabilities = await createComfyUiAdapter(descriptor).capabilities()
    const specs = capabilities.models[0]!.params['text_to_image']!
    const sampler = specs.find((spec) => spec.id === 'sampler_name')

    expect(sampler?.type).toBe('enum')
    expect(sampler?.options?.map((option) => option.value)).toContain('dpmpp_2m')
    expect(sampler?.default).toBe('euler')
  })

  it('caps the seed at MAX_SAFE_INTEGER and gives it no default', async () => {
    const capabilities = await createComfyUiAdapter(descriptor).capabilities()
    const specs = capabilities.models[0]!.params['text_to_image']!
    const seed = specs.find((spec) => spec.id === 'seed')

    // ComfyUI states 2^64-1. Anything above MAX_SAFE_INTEGER would not survive
    // JSON.stringify, so the job would run on a seed nobody chose.
    expect(seed?.type).toBe('seed')
    expect(seed?.max).toBe(Number.MAX_SAFE_INTEGER)
    expect(seed?.default).toBeUndefined()
  })

  it('carries a node’s tooltip through as help text', async () => {
    const capabilities = await createComfyUiAdapter(descriptor).capabilities()
    const specs = capabilities.models[0]!.params['text_to_image']!

    expect(specs.find((spec) => spec.id === 'steps')?.help).toMatch(
      /number of steps/i
    )
  })

  it('binds the same node input on two nodes to two distinct params', async () => {
    const capabilities = await createComfyUiAdapter(descriptor).capabilities()
    const hires = capabilities.models.find(
      (model) => model.local_id === 'txt2img-hires'
    )!
    const specs = hires.params['text_to_image']!

    // Both derive from KSampler.steps, on nodes 5 and 9.
    expect(specs.find((spec) => spec.id === 'steps')?.max).toBe(10000)
    expect(specs.find((spec) => spec.id === 'hires_steps')?.max).toBe(10000)
  })

  it('does not surface a template whose node class the server lacks', async () => {
    const withoutSave = JSON.parse(JSON.stringify(OBJECT_INFO)) as ComfyObjectInfo
    delete withoutSave['SaveImage']
    state.objectInfo = withoutSave

    const capabilities = await createComfyUiAdapter(descriptor).capabilities()

    // SaveImage is in both graphs but exposes nothing, so only the node-class
    // check can catch it. Submitting a graph naming a class the server does not
    // have earns a 400 from /prompt after the user has already waited.
    expect(capabilities.models).toEqual([])
  })

  it('does not surface a template whose optional node class is missing', async () => {
    const withoutUpscale = { ...OBJECT_INFO }
    delete (withoutUpscale as Record<string, unknown>)['LatentUpscale']
    state.objectInfo = withoutUpscale

    const capabilities = await createComfyUiAdapter(descriptor).capabilities()

    expect(capabilities.models.map((model) => model.local_id)).toEqual(['txt2img'])
  })

  it('does not surface a template whose exposed input is gone from the node', async () => {
    const renamed = JSON.parse(JSON.stringify(OBJECT_INFO)) as ComfyObjectInfo
    delete renamed['KSampler']!.input!.required!['cfg']
    state.objectInfo = renamed

    const capabilities = await createComfyUiAdapter(descriptor).capabilities()

    // Both templates use that KSampler input; neither may be submitted blind.
    expect(capabilities.models).toEqual([])
  })

  it('marks a model unrunnable when the install has no checkpoints', async () => {
    const empty = JSON.parse(JSON.stringify(OBJECT_INFO)) as ComfyObjectInfo
    empty['CheckpointLoaderSimple']!.input!.required!['ckpt_name']![0] = []
    state.objectInfo = empty

    const capabilities = await createComfyUiAdapter(descriptor).capabilities()

    expect(capabilities.models[0]?.fitness?.status).toBe('unsupported')
    expect(capabilities.models[0]?.fitness?.reason).toMatch(/checkpoint/i)
  })

  it('reports devices with VRAM in megabytes, not bytes', async () => {
    const capabilities = await createComfyUiAdapter(descriptor).capabilities()

    expect(capabilities.devices[0]).toMatchObject({
      label: 'cpu',
      backend: 'cpu',
      vram_total_mb: Math.round(68448395264 / 1024 / 1024),
    })
  })

  it('still returns capabilities when /system_stats is unavailable', async () => {
    const adapter = createComfyUiAdapter(descriptor)
    vi.mocked(fetch).mockImplementation(async (input: string) => {
      if (String(input).endsWith('/object_info')) return json(OBJECT_INFO)
      return json({ error: 'not found' }, 404)
    })

    const capabilities = await adapter.capabilities()

    expect(capabilities.models.length).toBeGreaterThan(0)
    expect(capabilities.devices).toEqual([])
  })
})

describe('createComfyUiAdapter — submit', () => {
  it('writes the caller’s params into the declared graph', async () => {
    await submitted()

    const body = state.bodies.at(-1) as {
      prompt: Record<string, { inputs: Record<string, unknown> }>
      client_id: string
    }
    expect(body.prompt['2']!.inputs.text).toBe('a red car')
    expect(body.prompt['1']!.inputs.ckpt_name).toBe(
      'v1-5-pruned-emaonly.safetensors'
    )
    expect(body.prompt['5']!.inputs.seed).toBe(7)
    // Links are untouched.
    expect(body.prompt['5']!.inputs.model).toEqual(['1', 0])
    expect(body.client_id).toBeTruthy()
  })

  it('resolves an absent seed rather than submitting the template’s zero', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const adapter = createComfyUiAdapter(descriptor)
    const capabilities = await adapter.capabilities()

    await adapter.submit({
      client_job_id: '01JCOMFY00000000000000001',
      provider_id: descriptor.id,
      model_id: capabilities.models[0]!.id,
      task: 'text_to_image',
      params: { prompt: 'a red car' },
    })

    const body = state.bodies.at(-1) as {
      prompt: Record<string, { inputs: Record<string, unknown> }>
    }
    expect(body.prompt['5']!.inputs.seed).toBe(
      Math.floor(0.5 * Number.MAX_SAFE_INTEGER)
    )
  })

  it('refuses a model id no declared template matches', async () => {
    const adapter = createComfyUiAdapter(descriptor)

    // The whole point of declared templates: never guess at a graph.
    await expect(
      adapter.submit({
        client_job_id: '01JCOMFY00000000000000002',
        provider_id: descriptor.id,
        model_id: 'comfyui-local:some-workflow-from-a-newer-build',
        task: 'text_to_image',
        params: {},
      })
    ).rejects.toThrow(/not a workflow template/i)
  })

  it('surfaces ComfyUI’s own rejection reason on a 400', async () => {
    state.submitStatus = 400
    state.submitBody = {
      error: {
        type: 'prompt_outputs_failed_validation',
        message: 'Prompt outputs failed validation',
        details: 'CheckpointLoaderSimple: ckpt_name not in list',
        extra_info: {},
      },
      node_errors: { '1': {} },
    }
    const adapter = createComfyUiAdapter(descriptor)
    const capabilities = await adapter.capabilities()

    await expect(
      adapter.submit({
        client_job_id: '01JCOMFY00000000000000003',
        provider_id: descriptor.id,
        model_id: capabilities.models[0]!.id,
        task: 'text_to_image',
        params: { prompt: 'x' },
      })
    ).rejects.toThrow(/ckpt_name not in list/)
  })
})

describe('createComfyUiAdapter — poll', () => {
  it('reports a queue position while the prompt is pending', async () => {
    const { adapter, snapshot } = await submitted()
    state.states = ['queued']

    const polled = await adapter.poll(snapshot)

    expect(polled.state).toBe('queued')
    expect(polled.queue_position).toBe(2)
  })

  it('maps a saved image to a /view URL with its mime type', async () => {
    const { adapter, snapshot } = await submitted()
    state.states = ['succeeded']

    const polled = await adapter.poll(snapshot)

    expect(polled.state).toBe('succeeded')
    expect(polled.outputs).toEqual([
      {
        kind: 'url',
        url: 'http://127.0.0.1:8188/view?filename=AtomicChat_00001_.png&type=output',
        mime: 'image/png',
      },
    ])
  })

  it('carries the exception type and message from a failed prompt', async () => {
    const { adapter, snapshot } = await submitted()
    state.states = ['failed']

    const polled = await adapter.poll(snapshot)

    expect(polled.state).toBe('failed')
    expect(polled.error).toEqual({
      code: 'torch.OutOfMemoryError',
      message: 'Allocation on device 0 would exceed allowed memory',
      retryable: false,
    })
  })

  it('reads an interrupted prompt as cancelled, not failed', async () => {
    const { adapter, snapshot } = await submitted()
    state.states = ['cancelled']

    const polled = await adapter.poll(snapshot)

    // ComfyUI records status_str 'error' for an interrupt. Reporting that as
    // failed would have the job manager retry a job the user stopped.
    expect(polled.state).toBe('cancelled')
    expect(polled.error).toBeNull()
  })

  it('reads a prompt cancelled before it ran as cancelled, not lost', async () => {
    const { adapter, snapshot } = await submitted()
    await adapter.cancel!(snapshot)
    // Deleted from the pending queue: no history entry is ever written and
    // neither queue table lists it any more.
    state.states = ['queued']
    state.absentFromQueue = true

    const polled = await adapter.poll(snapshot)

    expect(polled.state).toBe('cancelled')
  })

  it('reports a prompt ComfyUI has forgotten rather than inventing a state', async () => {
    const adapter = createComfyUiAdapter(descriptor)
    state.states = ['queued']
    state.absentFromQueue = true

    const polled = await adapter.poll({
      client_job_id: 'c1',
      provider_job_id: 'evicted-from-history',
    })

    expect(polled.state).toBe('failed')
    expect(polled.error?.code).toBe('job_unknown')
  })

  it('refuses to poll a job it has never seen an id for', async () => {
    await expect(
      createComfyUiAdapter(descriptor).poll({ client_job_id: 'never-submitted' })
    ).rejects.toThrow(/No ComfyUI prompt is known/)
  })
})

describe('createComfyUiAdapter — cancel', () => {
  it('interrupts a running prompt and deletes a pending one, in that order', async () => {
    const { adapter, snapshot } = await submitted()
    state.urls.length = 0
    state.bodies.length = 0

    await adapter.cancel!(snapshot)

    expect(state.urls).toEqual([
      'http://127.0.0.1:8188/interrupt',
      'http://127.0.0.1:8188/queue',
    ])
    expect(state.bodies).toEqual([
      { prompt_id: 'prompt-1' },
      { delete: ['prompt-1'] },
    ])
  })
})

describe('createComfyUiAdapter — subscribe', () => {
  it('opens the WebSocket with the same client id it submits under', async () => {
    const { adapter, snapshot } = await submitted()
    const submitBody = state.bodies.at(-1) as { client_id: string }

    const unsubscribe = adapter.subscribe!(snapshot, () => {})

    expect(FakeWebSocket.last.url).toBe(
      `ws://127.0.0.1:8188/ws?clientId=${submitBody.client_id}`
    )
    unsubscribe()
  })

  it('negotiates feature flags as its first frame', async () => {
    const { adapter, snapshot } = await submitted()
    const unsubscribe = adapter.subscribe!(snapshot, () => {})

    FakeWebSocket.last.open()

    expect(JSON.parse(FakeWebSocket.last.sent[0]!)).toEqual({
      type: 'feature_flags',
      data: { supports_preview_metadata: false },
    })
    unsubscribe()
  })

  it('turns a progress_state frame into progress and a step count', async () => {
    const { adapter, snapshot } = await submitted()
    const events: unknown[] = []
    const unsubscribe = adapter.subscribe!(snapshot, (event) => events.push(event))

    FakeWebSocket.last.emit('progress_state', {
      prompt_id: 'prompt-1',
      nodes: {
        '5': { value: 5, max: 20, state: 'running', node_id: '5' },
        '1': { value: 1, max: 1, state: 'finished', node_id: '1' },
      },
    })

    expect(events).toEqual([
      expect.objectContaining({
        state: 'running',
        progress: 25,
        step: { current: 5, total: 20 },
      }),
    ])
    unsubscribe()
  })

  it('understands the legacy single-node progress frame too', async () => {
    const { adapter, snapshot } = await submitted()
    const events: unknown[] = []
    const unsubscribe = adapter.subscribe!(snapshot, (event) => events.push(event))

    FakeWebSocket.last.emit('progress', {
      prompt_id: 'prompt-1',
      node: '5',
      value: 10,
      max: 20,
    })

    expect(events).toEqual([expect.objectContaining({ progress: 50 })])
    unsubscribe()
  })

  it('builds outputs from executed frames and settles on execution_success', async () => {
    const { adapter, snapshot } = await submitted()
    const events: unknown[] = []
    const unsubscribe = adapter.subscribe!(snapshot, (event) => events.push(event))

    FakeWebSocket.last.emit('executed', {
      prompt_id: 'prompt-1',
      node: '7',
      output: {
        images: [
          { filename: 'AtomicChat_00001_.png', subfolder: '', type: 'output' },
        ],
      },
    })
    FakeWebSocket.last.emit('execution_success', { prompt_id: 'prompt-1' })

    expect(events).toEqual([
      expect.objectContaining({
        state: 'succeeded',
        outputs: [
          {
            kind: 'url',
            url: 'http://127.0.0.1:8188/view?filename=AtomicChat_00001_.png&type=output',
            mime: 'image/png',
          },
        ],
      }),
    ])
    unsubscribe()
  })

  it('reports an interruption frame as cancelled', async () => {
    const { adapter, snapshot } = await submitted()
    const events: { state?: string }[] = []
    const unsubscribe = adapter.subscribe!(snapshot, (event) => events.push(event))

    FakeWebSocket.last.emit('execution_interrupted', {
      prompt_id: 'prompt-1',
      node_id: '5',
    })

    expect(events.at(-1)?.state).toBe('cancelled')
    unsubscribe()
  })

  it('reports an error frame as failed, with the exception type', async () => {
    const { adapter, snapshot } = await submitted()
    const events: { state?: string; error?: { code?: string } }[] = []
    const unsubscribe = adapter.subscribe!(snapshot, (event) => events.push(event))

    FakeWebSocket.last.emit('execution_error', {
      prompt_id: 'prompt-1',
      exception_type: 'torch.OutOfMemoryError',
      exception_message: 'out of memory',
    })

    expect(events.at(-1)).toMatchObject({
      state: 'failed',
      error: { code: 'torch.OutOfMemoryError', retryable: false },
    })
    unsubscribe()
  })

  it('ignores frames belonging to another prompt', async () => {
    const { adapter, snapshot } = await submitted()
    const events: unknown[] = []
    const unsubscribe = adapter.subscribe!(snapshot, (event) => events.push(event))

    FakeWebSocket.last.emit('execution_success', { prompt_id: 'someone-else' })

    expect(events).toEqual([])
    unsubscribe()
  })

  it('ignores binary preview frames', async () => {
    const { adapter, snapshot } = await submitted()
    const events: unknown[] = []
    const unsubscribe = adapter.subscribe!(snapshot, (event) => events.push(event))

    FakeWebSocket.last.emitRaw(new ArrayBuffer(8))

    expect(events).toEqual([])
    unsubscribe()
  })

  it('falls back to polling when the socket fails, without losing the job', async () => {
    const { adapter, snapshot } = await submitted()
    vi.useFakeTimers()
    try {
      const events: { state?: string }[] = []
      const unsubscribe = adapter.subscribe!(snapshot, (event) => events.push(event))

      FakeWebSocket.last.fail()
      state.states = ['running']

      await vi.advanceTimersByTimeAsync(1500)

      expect(events.at(-1)?.state).toBe('running')
      unsubscribe()
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops the fallback once the job reaches a terminal state', async () => {
    const { adapter, snapshot } = await submitted()
    vi.useFakeTimers()
    try {
      const events: { state?: string }[] = []
      const unsubscribe = adapter.subscribe!(snapshot, (event) => events.push(event))

      FakeWebSocket.last.fail()
      state.states = ['succeeded']

      await vi.advanceTimersByTimeAsync(1500)
      const afterTerminal = events.length
      await vi.advanceTimersByTimeAsync(6000)

      expect(events.at(-1)?.state).toBe('succeeded')
      expect(events.length).toBe(afterTerminal)
      unsubscribe()
    } finally {
      vi.useRealTimers()
    }
  })

  it('emits nothing more once unsubscribed', async () => {
    const { adapter, snapshot } = await submitted()
    const events: unknown[] = []
    const unsubscribe = adapter.subscribe!(snapshot, (event) => events.push(event))

    unsubscribe()
    FakeWebSocket.last.emit('execution_success', { prompt_id: 'prompt-1' })

    expect(events).toEqual([])
    expect(FakeWebSocket.last.closed).toBe(true)
  })
})
