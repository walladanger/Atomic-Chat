/**
 * Remote HTTP (OpenAI-compatible images) adapter tests.
 *
 * The third adapter, and the first one that is *synchronous*: `POST
 * /v1/images/generations` returns the finished image in the same response,
 * with no job id and nothing to poll. The contract is asynchronous, so the
 * interesting question this file answers is whether an adapter can bridge that
 * honestly without the conformance suite being bent to fit.
 *
 * Shapes were read from the official OpenAI Node SDK source on 2026-09-09
 * (`src/resources/images.ts` for the request/response, `src/core/error.ts` for
 * the error envelope and status mapping), not from documentation prose and not
 * from memory - AGENTS.md 6.2. The docs site returns 403 to automated fetches.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MediaJobState, MediaProviderDescriptor } from '../../contract'
import { createRemoteHttpAdapter } from '../remoteHttp'
import {
  describeMediaAdapterConformance,
  type ConformanceScenarios,
} from './conformance'

const API_KEY = 'sk-test-SUPERSECRET-do-not-log-0123456789'

const descriptor: MediaProviderDescriptor = {
  id: 'openai-images',
  label: 'OpenAI Images',
  kind: 'remote_http',
  adapter: 'openai-images',
  base_url: 'https://api.openai.com/v1',
  // The descriptor records only the NAME of where the secret lives. The secret
  // itself never appears in a descriptor, in the store, or in localStorage.
  auth: { type: 'bearer', setting_key: 'openai.api_key' },
  enabled: true,
  origin: 'user',
}

// --- mock transport ---------------------------------------------------------

type TransportState = {
  reachable: boolean
  authorised: boolean
  rateLimited: boolean
  requestId: string
  /** Resolves the response BODY. Headers are delivered before this settles. */
  body: () => Promise<unknown>
  /** Hold the body open, so a job can be observed mid-flight. */
  holdBody: boolean
  lastSignal?: AbortSignal
  calls: number
  urls: string[]
  headers: Record<string, string>[]
  bodies: unknown[]
}

let state: TransportState
let releaseBody: (() => void) | undefined

const IMAGE_RESPONSE = {
  created: 1_757_000_000,
  background: 'opaque',
  output_format: 'png',
  quality: 'high',
  size: '1024x1024',
  data: [
    {
      url: 'https://oaidalleapiprodscus.blob.core.windows.net/private/img-abc.png?se=2026-09-09T20%3A00%3A00Z&sig=REDACTED',
      revised_prompt: 'a red car, studio lighting',
    },
  ],
}

/**
 * A Response-like object whose headers are available before its body settles.
 * That separation is the whole trick the adapter relies on, so the fake has to
 * model it rather than hand back an already-complete `Response`.
 */
function fakeResponse(status: number, body: () => Promise<unknown>) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'x-request-id': state.requestId }),
    json: body,
  } as unknown as Response
}

function resolved(value: unknown) {
  return () => Promise.resolve(value)
}

beforeEach(() => {
  releaseBody = undefined
  state = {
    reachable: true,
    authorised: true,
    rateLimited: false,
    requestId: 'req_conformance',
    body: resolved(IMAGE_RESPONSE),
    holdBody: false,
    calls: 0,
    urls: [],
    headers: [],
    bodies: [],
  }

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      state.calls += 1
      state.urls.push(String(input))
      state.headers.push({ ...((init?.headers as Record<string, string>) ?? {}) })
      state.lastSignal = init?.signal ?? undefined
      if (init?.body) state.bodies.push(JSON.parse(String(init.body)))

      if (!state.reachable) throw new TypeError('fetch failed')

      if (!state.authorised) {
        return fakeResponse(
          401,
          resolved({
            error: {
              message: 'Incorrect API key provided.',
              type: 'invalid_request_error',
              param: null,
              code: 'invalid_api_key',
            },
          })
        )
      }

      if (state.rateLimited) {
        return fakeResponse(
          429,
          resolved({
            error: {
              message: 'Rate limit reached for images.',
              type: 'requests',
              param: null,
              code: 'rate_limit_exceeded',
            },
          })
        )
      }

      if (String(input).endsWith('/models')) {
        return fakeResponse(200, resolved({ object: 'list', data: [] }))
      }

      if (state.holdBody) {
        return fakeResponse(
          200,
          () =>
            new Promise((resolve) => {
              releaseBody = () => resolve(IMAGE_RESPONSE)
            })
        )
      }

      return fakeResponse(200, state.body)
    })
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const resolveSecret = () => API_KEY

const scenarios: ConformanceScenarios = {
  online() {
    state.reachable = true
    state.authorised = true
    state.rateLimited = false
  },
  unreachable() {
    state.reachable = false
  },
  unauthorised() {
    // Unlike the two local providers, this one genuinely can fail to
    // authenticate, so the conformance test for it actually runs.
    state.reachable = true
    state.authorised = false
    return true
  },
  capabilities() {
    state.reachable = true
    state.authorised = true
  },
  acceptsSubmit(providerJobId: string) {
    state.reachable = true
    state.authorised = true
    state.rateLimited = false
    state.requestId = providerJobId
    state.holdBody = false
    state.body = resolved(IMAGE_RESPONSE)
  },
  jobStates(states: MediaJobState[]) {
    const last = states[states.length - 1]
    if (last === 'failed') {
      state.body = () => Promise.reject(new TypeError('connection reset'))
      return
    }
    state.body = resolved(IMAGE_RESPONSE)
  },
  synchronous() {
    // The result comes back in the submit response. Declared, so the three
    // poll tests assert that fact instead of a job progression this provider
    // cannot have.
    return true
  },
  lastSignal() {
    return state.lastSignal
  },
  callCount() {
    return state.calls
  },
}

describeMediaAdapterConformance({
  name: 'Remote HTTP images',
  descriptor,
  createAdapter: (d) => createRemoteHttpAdapter(d, { resolveSecret }),
  scenarios,
})

// --- adapter-specific behaviour ---------------------------------------------

const build = () => createRemoteHttpAdapter(descriptor, { resolveSecret })

async function submitted() {
  const adapter = build()
  const capabilities = await adapter.capabilities()
  const model = capabilities.models[0]!
  const snapshot = await adapter.submit({
    client_job_id: '01JREMOTE0000000000000000',
    provider_id: descriptor.id,
    model_id: model.id,
    task: 'text_to_image',
    params: { prompt: 'a red car', size: '1024x1024' },
  })
  return { adapter, snapshot }
}

describe('createRemoteHttpAdapter — the secret', () => {
  it('sends the key as a bearer token', async () => {
    await build().health()

    expect(state.headers[0]?.['Authorization']).toBe(`Bearer ${API_KEY}`)
  })

  it('never writes the key to the console, on success or on failure', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (level) => vi.spyOn(console, level).mockImplementation(() => {})
    )

    await build().health()
    state.authorised = false
    await build().health()
    state.reachable = false
    await build().health()

    const written = spies
      .flatMap((spy) => spy.mock.calls)
      .flat()
      .map((entry) => String(entry))
      .join('\n')
    expect(written).not.toContain(API_KEY)
  })

  it('keeps the key out of the error it throws when a submit is rejected', async () => {
    const adapter = build()
    const capabilities = await adapter.capabilities()
    state.authorised = false

    // An error object is the most likely thing to reach a log line or a Sentry
    // breadcrumb, so it is the most important place for the key not to be.
    const error = await adapter
      .submit({
        client_job_id: '01JREMOTE0000000000000001',
        provider_id: descriptor.id,
        model_id: capabilities.models[0]!.id,
        task: 'text_to_image',
        params: { prompt: 'a red car' },
      })
      .catch((thrown: Error) => thrown)

    expect(String(error)).not.toContain(API_KEY)
    expect(JSON.stringify(error, Object.getOwnPropertyNames(error))).not.toContain(
      API_KEY
    )
  })

  it('reports unauthorised rather than offline when the key is refused', async () => {
    state.authorised = false

    const health = await build().health()

    expect(health.state).toBe('unauthorised')
  })

  it('refuses to submit at all when no key is configured', async () => {
    const adapter = createRemoteHttpAdapter(descriptor, {
      resolveSecret: () => undefined,
    })
    const capabilities = await adapter.capabilities()

    await expect(
      adapter.submit({
        client_job_id: '01JREMOTE0000000000000002',
        provider_id: descriptor.id,
        model_id: capabilities.models[0]!.id,
        task: 'text_to_image',
        params: { prompt: 'a red car' },
      })
    ).rejects.toThrow(/no api key/i)
    // And never reached the network with a blank Authorization header.
    expect(state.urls.some((url) => url.includes('/images/generations'))).toBe(
      false
    )
  })
})

describe('createRemoteHttpAdapter — bridging a synchronous API', () => {
  it('starts the job live, using the request id the response headers carry', async () => {
    state.holdBody = true
    state.requestId = 'req_abc123'
    const { snapshot } = await submitted()

    // fetch resolves once the HEADERS arrive; the body is still in flight. That
    // is what lets a synchronous API satisfy an asynchronous contract without
    // the adapter inventing a job id or lying about the state.
    expect(snapshot.state).toBe('queued')
    expect(snapshot.provider_job_id).toBe('req_abc123')
  })

  it('reports running while the body is still arriving', async () => {
    state.holdBody = true
    const { adapter, snapshot } = await submitted()

    const polled = await adapter.poll(snapshot)

    expect(polled.state).toBe('running')
  })

  it('settles to succeeded once the body lands', async () => {
    state.holdBody = true
    const { adapter, snapshot } = await submitted()

    releaseBody!()
    const polled = await adapter.poll(snapshot)

    expect(polled.state).toBe('succeeded')
  })

  it('does not re-send the request on a second poll', async () => {
    const { adapter, snapshot } = await submitted()
    const afterSubmit = state.calls

    await adapter.poll(snapshot)
    await adapter.poll(snapshot)

    // One generation, one charge. Polling must never be a second purchase.
    expect(state.calls).toBe(afterSubmit)
  })
})

describe('createRemoteHttpAdapter — outputs', () => {
  it('maps a returned url to a url output ref', async () => {
    const { adapter, snapshot } = await submitted()

    const polled = await adapter.poll(snapshot)

    expect(polled.outputs?.[0]).toMatchObject({
      kind: 'url',
      url: IMAGE_RESPONSE.data[0]!.url,
      mime: 'image/png',
    })
  })

  it('does not invent an expires_at the API never sent', async () => {
    const { adapter, snapshot } = await submitted()

    const polled = await adapter.poll(snapshot)

    // OpenAI's images response carries no expiry field. Guessing one would put
    // a fabricated timestamp into the library's provenance record.
    expect(polled.outputs?.[0]).not.toHaveProperty('expires_at')
  })

  it('carries expires_at through when a provider does send one', async () => {
    state.body = resolved({
      created: 1,
      data: [{ url: 'https://cdn.example/img.png', expires_at: 1_757_003_600 }],
    })
    const { adapter, snapshot } = await submitted()

    const polled = await adapter.poll(snapshot)

    expect(polled.outputs?.[0]).toMatchObject({ expires_at: 1_757_003_600 })
  })

  it('maps b64_json to an inline output ref', async () => {
    state.body = resolved({
      created: 1,
      output_format: 'webp',
      data: [{ b64_json: 'aGVsbG8=' }],
    })
    const { adapter, snapshot } = await submitted()

    const polled = await adapter.poll(snapshot)

    expect(polled.outputs?.[0]).toEqual({
      kind: 'inline',
      base64: 'aGVsbG8=',
      mime: 'image/webp',
    })
  })

  it('survives a response with no data array at all', async () => {
    // `data` is optional in the official SDK's ImagesResponse type.
    state.body = resolved({ created: 1 })
    const { adapter, snapshot } = await submitted()

    const polled = await adapter.poll(snapshot)

    expect(polled.state).toBe('failed')
    expect(polled.outputs).toEqual([])
  })
})

describe('createRemoteHttpAdapter — errors', () => {
  it('marks a rate limit retryable, unlike a rejected key', async () => {
    state.rateLimited = true
    const adapter = build()
    const capabilities = await adapter.capabilities()

    const error = await adapter
      .submit({
        client_job_id: '01JREMOTE0000000000000003',
        provider_id: descriptor.id,
        model_id: capabilities.models[0]!.id,
        task: 'text_to_image',
        params: { prompt: 'a red car' },
      })
      .catch((thrown) => thrown as { retryable?: boolean; status?: number })

    // 429 is the one error worth trying again; 401 never is.
    expect(error.status).toBe(429)
    expect(error.retryable).toBe(true)
  })

  it('carries the provider’s own message and code', async () => {
    state.rateLimited = true
    const adapter = build()
    const capabilities = await adapter.capabilities()

    const error = await adapter
      .submit({
        client_job_id: '01JREMOTE0000000000000004',
        provider_id: descriptor.id,
        model_id: capabilities.models[0]!.id,
        task: 'text_to_image',
        params: { prompt: 'a red car' },
      })
      .catch((thrown) => thrown as Error & { code?: string })

    expect(error.message).toMatch(/rate limit/i)
    expect(error.code).toBe('rate_limit_exceeded')
  })
})

describe('createRemoteHttpAdapter — capabilities', () => {
  it('declares its models rather than pretending to discover them', async () => {
    const capabilities = await build().capabilities()

    // GET /models lists chat models too and cannot say which generate images,
    // so the model list is declared, as it is for ComfyUI templates.
    expect(capabilities.models.length).toBeGreaterThan(0)
    for (const model of capabilities.models) {
      expect(model.id).toBe(`${descriptor.id}:${model.local_id}`)
    }
  })

  it('admits it can neither cancel nor stream', async () => {
    const capabilities = await build().capabilities()

    // There is no cancel endpoint and no event stream for images. Claiming
    // either would put a button in the UI that cannot work.
    expect(capabilities.features).toMatchObject({
      cancel: false,
      events: false,
    })
    expect(build().cancel).toBeUndefined()
    expect(build().subscribe).toBeUndefined()
  })

  it('sends the validated params as the documented request body', async () => {
    const { adapter } = await submitted()
    void adapter

    expect(state.bodies.at(-1)).toMatchObject({
      model: 'gpt-image-1',
      prompt: 'a red car',
      size: '1024x1024',
    })
  })
})
