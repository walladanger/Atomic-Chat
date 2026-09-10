/**
 * The shared adapter conformance suite.
 *
 * Every provider adapter must pass this unmodified. That is the whole point: if
 * a test in here needs an adapter-specific branch, the contract is underspecified
 * and the contract is what should change, not this file.
 *
 * It is parameterised over an adapter factory plus a *scenario* object. The
 * scenarios exist because wire formats are provider-specific while behaviour is
 * not - each adapter's test file says how to make its transport behave, and this
 * suite says what must then be true. Nothing here may import a provider module.
 *
 * Not a `.test.ts` file: it exports a function that a provider's own test file
 * calls, so it must not be collected as a suite of its own.
 */

import { describe, expect, it } from 'vitest'

import { validateParams } from '../../contract'
import type {
  MediaJobSnapshot,
  MediaJobState,
  MediaProviderAdapter,
  MediaProviderDescriptor,
  NormalizedMediaRequest,
} from '../../contract'

/**
 * How to drive one adapter's transport. Implemented by each adapter's test file.
 *
 * Every method configures the transport for the *next* call(s) and must be
 * callable inside a test body.
 */
export type ConformanceScenarios = {
  /** The provider answers a health probe normally. */
  online(): void
  /** The provider cannot be reached at all (connection refused, DNS, timeout). */
  unreachable(): void
  /**
   * The provider is reachable but rejects the caller's credentials. Return
   * `false` to declare the provider cannot authenticate at all (a local worker
   * with `auth.type === 'none'`), and the matching test is skipped loudly
   * rather than silently passing.
   */
  unauthorised(): boolean
  /** The provider answers a capabilities request in its own wire version. */
  capabilities(): void
  /** A submit is accepted and assigned this provider-side job id. */
  acceptsSubmit(providerJobId: string): void
  /**
   * Successive polls report these states in order, repeating the last one. When
   * the final state is `failed` the provider also reports a reason.
   *
   * For a synchronous provider this configures the outcome of the *submit*,
   * because that is where the work happens; the suite calls it before
   * submitting in that case.
   */
  jobStates(states: MediaJobState[]): void
  /**
   * Return `true` to declare that this provider produces its result in the
   * submit response and has no job to query afterwards - `features.synchronous`.
   *
   * Declared, not inferred, and following the same pattern as `unauthorised`:
   * the tests that cannot apply then assert the declaration itself rather than
   * silently passing. Optional, so an adapter written before this existed is
   * still treated as job-based.
   */
  synchronous?(): boolean
  /** The `AbortSignal` the transport received on the most recent call. */
  lastSignal(): AbortSignal | undefined
  /** How many transport calls have been made since the last reset. */
  callCount(): number
}

export type ConformanceHarness = {
  /** Name for the suite heading, e.g. 'Atomic Media Worker'. */
  name: string
  descriptor: MediaProviderDescriptor
  createAdapter: (descriptor: MediaProviderDescriptor) => MediaProviderAdapter
  scenarios: ConformanceScenarios
}

const TERMINAL: ReadonlySet<MediaJobState> = new Set<MediaJobState>([
  'succeeded',
  'failed',
  'cancelled',
])

const CLIENT_JOB_ID = '01JCONFORMANCEJOBID00000'
const PROVIDER_JOB_ID = 'provider-job-1'

/** Build a submittable request from whatever the adapter actually advertises. */
async function requestFrom(
  adapter: MediaProviderAdapter,
  scenarios: ConformanceScenarios
): Promise<NormalizedMediaRequest> {
  scenarios.capabilities()
  const capabilities = await adapter.capabilities()
  const model = capabilities.models[0]
  if (!model) throw new Error('conformance: provider advertised no models')
  const task = model.tasks[0]
  if (!task) throw new Error('conformance: model advertised no tasks')

  const specs = model.params[task] ?? []
  const values: Record<string, unknown> = {}
  for (const spec of specs) {
    if (spec.default !== undefined) values[spec.id] = spec.default
    // Something must be supplied for a required free-text field.
    else if (spec.required) values[spec.id] = 'conformance'
  }

  return {
    client_job_id: CLIENT_JOB_ID,
    provider_id: capabilities.provider_id,
    model_id: model.id,
    task,
    params: validateParams(specs, values).values,
  }
}

export function describeMediaAdapterConformance(harness: ConformanceHarness) {
  const { name, descriptor, createAdapter, scenarios } = harness
  const adapter = () => createAdapter(descriptor)
  const isSynchronous = () => scenarios.synchronous?.() === true

  describe(`${name} — adapter conformance`, () => {
    describe('descriptor', () => {
      it('exposes the descriptor it was built from', () => {
        expect(adapter().descriptor).toEqual(descriptor)
      })
    })

    describe('health', () => {
      it('reports online when the provider answers', async () => {
        scenarios.online()

        await expect(adapter().health()).resolves.toMatchObject({
          state: 'online',
        })
      })

      it('reports offline rather than throwing when unreachable', async () => {
        scenarios.unreachable()

        const health = await adapter().health()

        expect(health.state).toBe('offline')
        // An unreachable provider must be reportable, not just an exception:
        // the UI has to render *why* it is offline.
        expect(health.detail ?? health.detail_key).toBeTruthy()
      })

      it('reports unauthorised distinctly from offline', async () => {
        if (!scenarios.unauthorised()) {
          // Declared inapplicable: this provider cannot authenticate at all.
          expect(descriptor.auth?.type ?? 'none').toBe('none')
          return
        }

        await expect(adapter().health()).resolves.toMatchObject({
          state: 'unauthorised',
        })
      })
    })

    describe('capabilities', () => {
      it('returns contract v2 whatever version the wire speaks', async () => {
        scenarios.capabilities()

        const capabilities = await adapter().capabilities()

        expect(capabilities.contract_version).toBe(2)
        expect(capabilities.provider_id).toBe(descriptor.id)
      })

      it('provider-qualifies every model id', async () => {
        scenarios.capabilities()

        const capabilities = await adapter().capabilities()

        expect(capabilities.models.length).toBeGreaterThan(0)
        for (const model of capabilities.models) {
          expect(model.id).toBe(`${model.provider_id}:${model.local_id}`)
          expect(model.provider_id).toBe(descriptor.id)
        }
      })

      it('declares a parameter schema for every task it claims', async () => {
        scenarios.capabilities()

        const capabilities = await adapter().capabilities()

        for (const model of capabilities.models) {
          for (const task of model.tasks) {
            expect(Array.isArray(model.params[task])).toBe(true)
          }
          // And never a schema for a task the model does not claim.
          for (const task of Object.keys(model.params)) {
            expect(model.tasks).toContain(task)
          }
        }
      })
    })

    describe('submit', () => {
      it('returns a snapshot carrying the caller’s client_job_id', async () => {
        const instance = adapter()
        const request = await requestFrom(instance, scenarios)
        scenarios.acceptsSubmit(PROVIDER_JOB_ID)

        const snapshot = await instance.submit(request)

        // The caller correlates on its own id. A provider that does not echo it
        // is the adapter's problem to solve, not the caller's.
        expect(snapshot.client_job_id).toBe(request.client_job_id)
        expect(snapshot.provider_id).toBe(descriptor.id)
        expect(snapshot.provider_job_id).toBe(PROVIDER_JOB_ID)
      })

      it('starts the job in a live state', async () => {
        const instance = adapter()
        const request = await requestFrom(instance, scenarios)
        scenarios.acceptsSubmit(PROVIDER_JOB_ID)

        const snapshot = await instance.submit(request)

        expect(['queued', 'running']).toContain(snapshot.state)
      })
    })

    describe('poll', () => {
      it('transitions queued to running to succeeded', async () => {
        const instance = adapter()
        const request = await requestFrom(instance, scenarios)
        scenarios.acceptsSubmit(PROVIDER_JOB_ID)
        const submitted = await instance.submit(request)

        if (isSynchronous()) {
          // Declared inapplicable: there is no job to query, so there is no
          // progression to observe. What must still hold is that the caller can
          // reach a terminal state through poll without knowing that, and that
          // the provider is honest about having no queue.
          const capabilities = await instance.capabilities()
          expect(capabilities.features?.synchronous).toBe(true)
          expect(capabilities.features?.queue ?? false).toBe(false)

          let settled: MediaJobSnapshot = await instance.poll(submitted)
          for (let i = 0; i < 5 && !TERMINAL.has(settled.state); i += 1) {
            settled = await instance.poll(submitted)
          }
          expect(TERMINAL.has(settled.state)).toBe(true)
          expect(settled.client_job_id).toBe(request.client_job_id)
          return
        }

        scenarios.jobStates(['queued', 'running', 'succeeded'])

        const states: MediaJobState[] = []
        for (let i = 0; i < 3; i += 1) {
          const snapshot: MediaJobSnapshot = await instance.poll(submitted)
          states.push(snapshot.state)
          expect(snapshot.client_job_id).toBe(request.client_job_id)
        }

        expect(states).toEqual(['queued', 'running', 'succeeded'])
      })

      it('carries a structured error on a failed job', async () => {
        const instance = adapter()
        const request = await requestFrom(instance, scenarios)
        scenarios.acceptsSubmit(PROVIDER_JOB_ID)

        // A synchronous provider decides the outcome at submit, so the failure
        // has to be arranged before it. The assertions below are identical
        // either way - only when the failure is configured differs.
        if (isSynchronous()) scenarios.jobStates(['failed'])
        const submitted = await instance.submit(request)
        if (!isSynchronous()) scenarios.jobStates(['failed'])

        let snapshot = await instance.poll(submitted)
        for (let i = 0; i < 5 && !TERMINAL.has(snapshot.state); i += 1) {
          snapshot = await instance.poll(submitted)
        }

        expect(snapshot.state).toBe('failed')
        expect(snapshot.error).toBeTruthy()
        expect(typeof snapshot.error?.code).toBe('string')
        expect(typeof snapshot.error?.message).toBe('string')
        expect(typeof snapshot.error?.retryable).toBe('boolean')
        // A failed job must not also claim outputs.
        expect(snapshot.outputs ?? []).toEqual([])
      })
    })

    describe('optional methods match declared features', () => {
      it('implements cancel if and only if features.cancel is true', async () => {
        const instance = adapter()
        scenarios.capabilities()
        const features = (await instance.capabilities()).features ?? {}

        expect(typeof instance.cancel === 'function').toBe(
          features.cancel === true
        )
      })

      it('implements subscribe if and only if features.events is true', async () => {
        const instance = adapter()
        scenarios.capabilities()
        const features = (await instance.capabilities()).features ?? {}

        expect(typeof instance.subscribe === 'function').toBe(
          features.events === true
        )
      })

      it('implements install if and only if features.install is true', async () => {
        const instance = adapter()
        scenarios.capabilities()
        const features = (await instance.capabilities()).features ?? {}

        expect(typeof instance.install === 'function').toBe(
          features.install === true
        )
      })
    })

    describe('AbortSignal', () => {
      it('forwards the caller’s signal to the transport on health', async () => {
        scenarios.online()
        const controller = new AbortController()

        await adapter().health(controller.signal)

        expect(scenarios.lastSignal()).toBe(controller.signal)
      })

      it('forwards the caller’s signal to the transport on capabilities', async () => {
        scenarios.capabilities()
        const controller = new AbortController()

        await adapter().capabilities(controller.signal)

        expect(scenarios.lastSignal()).toBe(controller.signal)
      })

      it('forwards the caller’s signal to the transport on submit', async () => {
        const instance = adapter()
        const request = await requestFrom(instance, scenarios)
        scenarios.acceptsSubmit(PROVIDER_JOB_ID)
        const controller = new AbortController()

        await instance.submit(request, controller.signal)

        expect(scenarios.lastSignal()).toBe(controller.signal)
      })

      it('forwards the caller’s signal to the transport on poll', async () => {
        const instance = adapter()
        const request = await requestFrom(instance, scenarios)
        scenarios.acceptsSubmit(PROVIDER_JOB_ID)
        const submitted = await instance.submit(request)
        scenarios.jobStates(['running'])
        const controller = new AbortController()

        if (isSynchronous()) {
          // Declared inapplicable: there is nothing to abort, because poll makes
          // no request. Asserted rather than skipped - a synchronous poll that
          // DID reach the network would generate, and charge, twice.
          const before = scenarios.callCount()
          await instance.poll(submitted, controller.signal)
          expect(scenarios.callCount()).toBe(before)
          return
        }

        await instance.poll(submitted, controller.signal)

        expect(scenarios.lastSignal()).toBe(controller.signal)
      })
    })
  })
}
