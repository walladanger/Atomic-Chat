import type {
  AtomicMediaCapabilities,
  AtomicMediaHealth,
  AtomicMediaJobRequest,
  AtomicMediaJobSnapshot,
  AtomicMediaJobStatus,
} from './types'

export const ATOMIC_MEDIA_BASE_URL = 'http://127.0.0.1:13420'

export type AtomicMediaClientErrorCode =
  | 'network_error'
  | 'http_error'
  | 'invalid_response'

export class AtomicMediaClientError extends Error {
  readonly code: AtomicMediaClientErrorCode
  readonly status?: number
  readonly details?: unknown

  constructor(
    message: string,
    code: AtomicMediaClientErrorCode,
    options?: { status?: number; details?: unknown; cause?: unknown }
  ) {
    super(message, { cause: options?.cause })
    this.name = 'AtomicMediaClientError'
    this.code = code
    this.status = options?.status
    this.details = options?.details
  }
}

const JOB_STATUSES: AtomicMediaJobStatus[] = [
  'queued',
  'running',
  'succeeded',
  'failed',
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asJobSnapshot(value: unknown): AtomicMediaJobSnapshot {
  if (!isRecord(value)) {
    throw new AtomicMediaClientError(
      'Atomic Media Worker returned a non-object job response.',
      'invalid_response'
    )
  }

  const jobId = value.job_id
  const status = value.status
  if (
    typeof jobId !== 'string' ||
    typeof status !== 'string' ||
    !JOB_STATUSES.includes(status as AtomicMediaJobStatus)
  ) {
    throw new AtomicMediaClientError(
      'Atomic Media Worker returned an invalid job response.',
      'invalid_response',
      { details: value }
    )
  }

  return value as AtomicMediaJobSnapshot
}

function asHealth(value: unknown): AtomicMediaHealth {
  if (
    !isRecord(value) ||
    typeof value.service !== 'string' ||
    typeof value.version !== 'string' ||
    typeof value.status !== 'string'
  ) {
    throw new AtomicMediaClientError(
      'Atomic Media Worker returned an invalid health response.',
      'invalid_response',
      { details: value }
    )
  }

  return {
    service: value.service,
    version: value.version,
    status: value.status,
  }
}

/**
 * Every request method takes an optional `AbortSignal` and forwards it to
 * `fetch`. Without that an abandoned request keeps running to completion: the
 * caller stops waiting but the work does not stop, which the media adapter
 * conformance suite requires of every provider.
 */
export class AtomicMediaClient {
  constructor(private readonly baseUrl = ATOMIC_MEDIA_BASE_URL) {}

  async health(signal?: AbortSignal): Promise<AtomicMediaHealth> {
    return asHealth(await this.requestJson('/health', { signal }))
  }

  async capabilities(
    signal?: AbortSignal
  ): Promise<AtomicMediaCapabilities | null> {
    try {
      const value = await this.requestJson('/capabilities', { signal })
      if (!isRecord(value)) {
        throw new AtomicMediaClientError(
          'Atomic Media Worker returned invalid capabilities.',
          'invalid_response',
          { details: value }
        )
      }
      return value
    } catch (error) {
      if (error instanceof AtomicMediaClientError && error.status === 404) {
        return null
      }
      throw error
    }
  }

  async createJob(
    request: AtomicMediaJobRequest,
    signal?: AbortSignal
  ): Promise<AtomicMediaJobSnapshot> {
    return asJobSnapshot(
      await this.requestJson('/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
        signal,
      })
    )
  }

  async getJob(
    jobId: string,
    signal?: AbortSignal
  ): Promise<AtomicMediaJobSnapshot> {
    return asJobSnapshot(
      await this.requestJson(`/jobs/${encodeURIComponent(jobId)}`, { signal })
    )
  }

  private async requestJson(path: string, init?: RequestInit): Promise<unknown> {
    let response: Response
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: 'GET',
        ...init,
      })
    } catch (cause) {
      throw new AtomicMediaClientError(
        'Atomic Media Worker is unavailable.',
        'network_error',
        { cause }
      )
    }

    const contentType = response.headers.get('content-type') ?? ''
    let payload: unknown = null
    if (contentType.includes('application/json')) {
      try {
        payload = await response.json()
      } catch (cause) {
        throw new AtomicMediaClientError(
          'Atomic Media Worker returned invalid JSON.',
          'invalid_response',
          { status: response.status, cause }
        )
      }
    } else {
      payload = await response.text()
    }

    if (!response.ok) {
      throw new AtomicMediaClientError(
        `Atomic Media Worker request failed with HTTP ${response.status}.`,
        'http_error',
        { status: response.status, details: payload }
      )
    }

    return payload
  }
}

export const atomicMediaClient = new AtomicMediaClient()
