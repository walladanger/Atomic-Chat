/**
 * The ComfyUI provider adapter.
 *
 * The second implementation of `MediaProviderAdapter`, and the one that decides
 * whether the contract is real or was just a description of the Radium Media
 * Worker. It passes `__tests__/conformance.ts` unmodified.
 *
 * ComfyUI is deliberately unlike the worker in every way the contract has to
 * absorb: it has no model list (only node classes), it assigns its own job id,
 * it reports terminal state through a history table rather than a job record,
 * it streams progress over a WebSocket, it can be cancelled, and its outputs
 * are files behind an HTTP endpoint rather than paths on disk. Where the worker
 * adapter had to admit missing features, this one has to map present ones.
 *
 * ## Recorded surface (T05-S01)
 *
 * Read 2026-09-09 from github.com/comfyanonymous/ComfyUI@master, whose
 * `comfyui_version.py` declares `__version__ = "0.35.0"`. Sources: `server.py`
 * (routes, `node_info`), `execution.py` (history entry, status messages),
 * `main.py` (how `status_str` is chosen), `comfy_execution/progress.py`
 * (progress frames). No shape here was inferred from a client library.
 *
 * | Call | Shape |
 * | --- | --- |
 * | `GET /system_stats` | `{ system: { comfyui_version, os, ram_total, ram_free, ... }, devices: [{ name, type, index, vram_total, vram_free, torch_vram_total, torch_vram_free }] }` |
 * | `GET /object_info` | see `comfyWorkflows.ts` |
 * | `POST /prompt` | body `{ prompt, client_id }`; 200 `{ prompt_id, number, node_errors }`; 400 `{ error: { type, message, details, extra_info }, node_errors }` |
 * | `GET /history/{id}` | `{}` when unknown, else `{ [id]: { prompt, outputs, status: { status_str, completed, messages } } }` |
 * | `GET /queue` | `{ queue_running: [[number, prompt_id, prompt, extra_data, outputs]], queue_pending: [...] }` |
 * | `POST /interrupt` | body `{ prompt_id }`; interrupts only if that prompt is the running one. Always 200 |
 * | `POST /queue` | body `{ delete: [prompt_id] }` removes a *pending* prompt. Always 200 |
 * | `GET /view` | `?filename=&type=&subfolder=` |
 * | `GET /ws?clientId=` | JSON frames `{ type, data }`, plus binary preview frames prefixed with a 4-byte big-endian event id |
 *
 * Two findings from that reading drive the code below:
 *
 * 1. **`prompt_id` may be supplied by the caller, but only as a canonical
 *    UUID** (`server.py` validates it and 400s otherwise). Our `client_job_id`
 *    is a ULID, so the server mints the id and this adapter keeps the mapping,
 *    exactly as the worker adapter does for a different reason.
 * 2. **A cancelled job is recorded as an error.** `main.py` sets
 *    `status_str='success' if e.success else 'error'`, and an interrupt makes
 *    `success` false. The only thing distinguishing a cancellation from a real
 *    failure is an `execution_interrupted` entry in `status.messages`, so that
 *    is what `poll` looks for. Reporting it as `failed` would make Task 7 retry
 *    a job the user deliberately stopped.
 */

import {
  COMFY_WORKFLOW_TEMPLATES,
  deriveModels,
  type ComfyGraph,
  type ComfyObjectInfo,
  type ComfyWorkflowTemplate,
} from './comfyWorkflows'
import { MEDIA_CONTRACT_VERSION } from '../contract'
import type {
  MediaCapabilities,
  MediaDeviceDescriptor,
  MediaJobHandle,
  MediaJobSnapshot,
  MediaJobState,
  MediaOutputRef,
  MediaProviderAdapter,
  MediaProviderDescriptor,
  MediaProviderHealth,
  NormalizedMediaRequest,
} from '../contract'

/** How often the WebSocket fallback polls once the socket has failed. */
const FALLBACK_POLL_INTERVAL_MS = 1500

export class ComfyUiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status?: number
  ) {
    super(message)
    this.name = 'ComfyUiError'
  }
}

// --- wire types --------------------------------------------------------------

type ComfySystemStats = {
  system?: { comfyui_version?: string }
  devices?: Array<{
    name?: string
    type?: string
    index?: number | null
    vram_total?: number
    vram_free?: number
  }>
}

/** `status.messages` entries are `[event_name, data]` pairs. */
type ComfyStatusMessage = [string, Record<string, unknown>] | string

type ComfyHistoryEntry = {
  outputs?: Record<string, Record<string, unknown>>
  status?: {
    status_str?: string
    completed?: boolean
    messages?: ComfyStatusMessage[]
  }
}

/** `[number, prompt_id, prompt, extra_data, outputs_to_execute]`. */
type ComfyQueueEntry = [number, string, ...unknown[]]

type ComfyQueue = {
  queue_running?: ComfyQueueEntry[]
  queue_pending?: ComfyQueueEntry[]
}

// --- helpers -----------------------------------------------------------------

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  flac: 'audio/flac',
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
}

function mimeOf(filename: string): string | undefined {
  const extension = filename.split('.').pop()?.toLowerCase()
  return extension ? MIME_BY_EXTENSION[extension] : undefined
}

function detailOf(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

/** `[event, data]` pairs, tolerating the bare strings the type hint claims. */
function messageNames(messages: ComfyStatusMessage[] | undefined): string[] {
  return (messages ?? []).map((message) =>
    Array.isArray(message) ? String(message[0]) : String(message)
  )
}

function messageData(
  messages: ComfyStatusMessage[] | undefined,
  event: string
): Record<string, unknown> | undefined {
  for (const message of messages ?? []) {
    if (Array.isArray(message) && message[0] === event) return message[1]
  }
  return undefined
}

/**
 * A ULID is not a UUID, so the client job id cannot be reused as ComfyUI's
 * `client_id`. This is the per-adapter socket identity that `POST /prompt`
 * announces and `/ws?clientId=` reconnects to; without matching the two, the
 * server routes progress frames to a different client and the stream is silent.
 */
function newClientId(): string {
  const random = globalThis.crypto?.randomUUID?.()
  if (random) return random.replace(/-/g, '')
  return Math.random().toString(16).slice(2).padEnd(32, '0')
}

// --- adapter -----------------------------------------------------------------

export function createComfyUiAdapter(
  descriptor: MediaProviderDescriptor
): MediaProviderAdapter {
  const base = (descriptor.base_url ?? 'http://127.0.0.1:8188').replace(/\/+$/, '')
  const clientId = newClientId()

  /** ComfyUI assigns the prompt id; the caller correlates on its own. */
  const providerJobIds = new Map<string, string>()
  /**
   * Prompt ids this adapter asked ComfyUI to stop. A cancelled job that never
   * started leaves no history entry and no queue entry, so without this the
   * only honest reading of "gone" would be "failed".
   */
  const cancelled = new Set<string>()

  async function request(
    path: string,
    init: RequestInit | undefined,
    signal: AbortSignal | undefined
  ): Promise<Response> {
    const response = await fetch(`${base}${path}`, { ...init, signal })
    return response
  }

  async function json<T>(
    path: string,
    init: RequestInit | undefined,
    signal: AbortSignal | undefined
  ): Promise<T> {
    const response = await request(path, init, signal)
    if (!response.ok) {
      throw new ComfyUiError(
        `ComfyUI answered ${response.status} for ${path}.`,
        'http_error',
        response.status
      )
    }
    return (await response.json()) as T
  }

  function resolveTemplate(modelId: string): ComfyWorkflowTemplate {
    const localId = modelId.startsWith(`${descriptor.id}:`)
      ? modelId.slice(descriptor.id.length + 1)
      : modelId
    const template = COMFY_WORKFLOW_TEMPLATES.find(
      (candidate) => candidate.local_id === localId
    )
    if (!template) {
      // Only declared templates may be submitted. An unknown model id means the
      // caller has state from a build that declared something this one does not,
      // and guessing a graph for it is exactly what this design rules out.
      throw new ComfyUiError(
        `"${modelId}" is not a workflow template this build declares.`,
        'unknown_model'
      )
    }
    return template
  }

  /** The template's graph with the caller's params written into it. */
  function buildGraph(
    template: ComfyWorkflowTemplate,
    params: Record<string, unknown>
  ): ComfyGraph {
    const graph: ComfyGraph = JSON.parse(JSON.stringify(template.graph))

    for (const declared of template.inputs) {
      const node = graph[declared.node]
      if (!node) continue

      if (declared.id in params) {
        node.inputs[declared.input] = params[declared.id]
        continue
      }

      // An absent seed means "randomise" (see `validateParams`: a blank value is
      // dropped rather than coerced to 0). Resolving it here rather than leaving
      // the template's 0 in place is what makes two identical submissions differ.
      if (declared.spec?.type === 'seed') {
        node.inputs[declared.input] = Math.floor(
          Math.random() * Number.MAX_SAFE_INTEGER
        )
      }
    }

    return graph
  }

  function outputsOf(entry: ComfyHistoryEntry): MediaOutputRef[] {
    const refs: MediaOutputRef[] = []

    for (const nodeOutput of Object.values(entry.outputs ?? {})) {
      for (const value of Object.values(nodeOutput ?? {})) {
        if (!Array.isArray(value)) continue
        for (const item of value) {
          // Every core output node - SaveImage, PreviewImage, SaveAnimatedWEBP -
          // reports `{ filename, subfolder, type }`, and custom nodes follow the
          // same shape under their own key (`gifs`, `audio`, ...). Keying on the
          // presence of `filename` rather than on a list of known keys is what
          // keeps a custom output node from silently producing nothing.
          if (!item || typeof item !== 'object') continue
          const file = item as { filename?: unknown; subfolder?: unknown; type?: unknown }
          if (typeof file.filename !== 'string') continue

          const query = new URLSearchParams({ filename: file.filename })
          query.set('type', typeof file.type === 'string' ? file.type : 'output')
          if (typeof file.subfolder === 'string' && file.subfolder) {
            query.set('subfolder', file.subfolder)
          }

          const mime = mimeOf(file.filename)
          refs.push({
            kind: 'url',
            url: `${base}/view?${query.toString()}`,
            ...(mime ? { mime } : {}),
          })
        }
      }
    }

    return refs
  }

  function snapshotOf(
    handle: MediaJobHandle,
    providerJobId: string,
    state: MediaJobState,
    extra: Partial<MediaJobSnapshot> = {}
  ): MediaJobSnapshot {
    return {
      client_job_id: handle.client_job_id,
      provider_job_id: providerJobId,
      provider_id: descriptor.id,
      state,
      progress: null,
      step: null,
      queue_position: null,
      outputs: [],
      error: null,
      ...extra,
    }
  }

  /** A finished history entry to a terminal snapshot. */
  function terminalSnapshot(
    handle: MediaJobHandle,
    providerJobId: string,
    entry: ComfyHistoryEntry
  ): MediaJobSnapshot {
    const names = messageNames(entry.status?.messages)

    if (names.includes('execution_interrupted')) {
      return snapshotOf(handle, providerJobId, 'cancelled')
    }

    if (entry.status?.status_str === 'success') {
      return snapshotOf(handle, providerJobId, 'succeeded', {
        progress: 100,
        outputs: outputsOf(entry),
      })
    }

    const failure = messageData(entry.status?.messages, 'execution_error')
    return snapshotOf(handle, providerJobId, 'failed', {
      error: {
        code:
          typeof failure?.exception_type === 'string'
            ? failure.exception_type
            : 'execution_error',
        message:
          typeof failure?.exception_message === 'string'
            ? failure.exception_message
            : 'ComfyUI reported the prompt failed but did not say why.',
        // A graph that raised is a graph that will raise again on the same
        // inputs. Claiming retryable here would have Task 7 loop on it.
        retryable: false,
      },
    })
  }

  async function poll(
    handle: MediaJobHandle,
    signal?: AbortSignal
  ): Promise<MediaJobSnapshot> {
    const providerJobId =
      handle.provider_job_id ?? providerJobIds.get(handle.client_job_id)
    if (!providerJobId) {
      throw new ComfyUiError(
        `No ComfyUI prompt is known for client job "${handle.client_job_id}".`,
        'unknown_job'
      )
    }

    const history = await json<Record<string, ComfyHistoryEntry>>(
      `/history/${encodeURIComponent(providerJobId)}`,
      undefined,
      signal
    )
    const entry = history[providerJobId]
    if (entry) return terminalSnapshot(handle, providerJobId, entry)

    // Not finished, so it is queued, running, or gone.
    const queue = await json<ComfyQueue>('/queue', undefined, signal)

    if ((queue.queue_running ?? []).some((item) => item[1] === providerJobId)) {
      return snapshotOf(handle, providerJobId, 'running')
    }

    const pending = queue.queue_pending ?? []
    const position = pending.findIndex((item) => item[1] === providerJobId)
    if (position >= 0) {
      return snapshotOf(handle, providerJobId, 'queued', {
        queue_position: position + 1,
      })
    }

    if (cancelled.has(providerJobId)) {
      // Deleted from the pending queue before it ever ran: no history is
      // written for a prompt that never executed.
      return snapshotOf(handle, providerJobId, 'cancelled')
    }

    // In neither table. ComfyUI evicts history past MAXIMUM_HISTORY_SIZE, so
    // this is reachable for an old job and is reported rather than guessed at.
    return snapshotOf(handle, providerJobId, 'failed', {
      error: {
        code: 'job_unknown',
        message: `ComfyUI no longer has any record of prompt "${providerJobId}".`,
        retryable: false,
      },
    })
  }

  return {
    descriptor,

    async health(signal?: AbortSignal): Promise<MediaProviderHealth> {
      try {
        const stats = await json<ComfySystemStats>(
          '/system_stats',
          undefined,
          signal
        )
        return {
          state: 'online',
          service: 'comfyui',
          ...(stats.system?.comfyui_version
            ? { version: stats.system.comfyui_version }
            : {}),
        }
      } catch (error) {
        // Core ComfyUI has no auth, but a reverse-proxied one does, and the
        // settings surface has to tell those two apart.
        const status = error instanceof ComfyUiError ? error.status : undefined
        return {
          state: status === 401 || status === 403 ? 'unauthorised' : 'offline',
          detail: detailOf(error),
        }
      }
    },

    async capabilities(signal?: AbortSignal): Promise<MediaCapabilities> {
      const [objectInfo, stats] = await Promise.all([
        json<ComfyObjectInfo>('/object_info', undefined, signal),
        // Devices are a nicety; a build that answers /object_info but not
        // /system_stats still has usable capabilities.
        json<ComfySystemStats>('/system_stats', undefined, signal).catch(
          () => undefined
        ),
      ])

      const derived = deriveModels(objectInfo, descriptor.id)

      const devices: MediaDeviceDescriptor[] = (stats?.devices ?? []).map(
        (device, index) => ({
          id: `${device.type ?? 'device'}:${device.index ?? index}`,
          label: device.name ?? `${device.type ?? 'device'} ${index}`,
          ...(device.type ? { backend: device.type } : {}),
          ...(typeof device.vram_total === 'number'
            ? { vram_total_mb: Math.round(device.vram_total / 1024 / 1024) }
            : {}),
          ...(typeof device.vram_free === 'number'
            ? { vram_free_mb: Math.round(device.vram_free / 1024 / 1024) }
            : {}),
        })
      )

      return {
        contract_version: MEDIA_CONTRACT_VERSION,
        provider_id: descriptor.id,
        devices,
        models: derived.map((entry) => entry.descriptor),
        tasks: [...new Set(derived.map((entry) => entry.template.task))].map(
          (task) => ({
            id: task,
            label_key: `media:task.${task}`,
            output_media_type:
              derived.find((entry) => entry.template.task === task)?.template
                .output_media_type ?? 'unknown',
          })
        ),
        features: {
          cancel: true,
          progress: true,
          queue: true,
          events: true,
          install: false,
          batch: true,
        },
      }
    },

    async submit(
      req: NormalizedMediaRequest,
      signal?: AbortSignal
    ): Promise<MediaJobSnapshot> {
      const template = resolveTemplate(req.model_id)
      const graph = buildGraph(template, req.params)

      const response = await request(
        '/prompt',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ prompt: graph, client_id: clientId }),
        },
        signal
      )

      const body = (await response.json()) as {
        prompt_id?: string
        error?: { type?: string; message?: string; details?: string }
        node_errors?: Record<string, unknown>
      }

      if (!response.ok || !body.prompt_id) {
        // A 400 here is a rejected graph, and its `error`/`node_errors` say
        // which node and why. Flattening that to "submit failed" would throw
        // away the only diagnosis the user is ever going to get.
        const detail = [body.error?.message, body.error?.details]
          .filter(Boolean)
          .join(' - ')
        throw new ComfyUiError(
          detail || `ComfyUI rejected the prompt (${response.status}).`,
          body.error?.type ?? 'prompt_rejected',
          response.status
        )
      }

      providerJobIds.set(req.client_job_id, body.prompt_id)

      return snapshotOf(
        { client_job_id: req.client_job_id },
        body.prompt_id,
        'queued'
      )
    },

    poll,

    subscribe(
      handle: MediaJobHandle,
      onEvent: (snapshot: MediaJobSnapshot) => void
    ): () => void {
      const providerJobId =
        handle.provider_job_id ?? providerJobIds.get(handle.client_job_id)
      if (!providerJobId) {
        throw new ComfyUiError(
          `No ComfyUI prompt is known for client job "${handle.client_job_id}".`,
          'unknown_job'
        )
      }

      let closed = false
      let fallback: ReturnType<typeof setInterval> | undefined
      let socket: WebSocket | undefined
      const collected: Record<string, Record<string, unknown>> = {}

      const emit = (
        state: MediaJobState,
        extra: Partial<MediaJobSnapshot> = {}
      ) => {
        if (closed) return
        onEvent(snapshotOf(handle, providerJobId, state, extra))
      }

      const stop = () => {
        if (fallback !== undefined) {
          clearInterval(fallback)
          fallback = undefined
        }
      }

      /**
       * The stream is a convenience, not the source of truth. If the socket
       * never opens, drops, or the runtime has no WebSocket at all, the job is
       * still running on the server - so the subscription degrades to polling
       * rather than stranding the caller with a job it stopped hearing about.
       */
      const startFallback = () => {
        if (closed || fallback !== undefined) return
        fallback = setInterval(() => {
          void poll(handle)
            .then((snapshot) => {
              if (closed) return
              onEvent(snapshot)
              if (snapshot.state !== 'queued' && snapshot.state !== 'running') {
                stop()
              }
            })
            .catch(() => {
              // Swallowed on purpose: a single failed poll is not a reason to
              // tear down a subscription the caller still holds.
            })
        }, FALLBACK_POLL_INTERVAL_MS)
      }

      const handleMessage = (raw: unknown) => {
        if (typeof raw !== 'string') return // Binary preview frames; not ours.
        let frame: { type?: string; data?: Record<string, unknown> }
        try {
          frame = JSON.parse(raw)
        } catch {
          return
        }

        const data = frame.data ?? {}
        const forOther =
          typeof data.prompt_id === 'string' && data.prompt_id !== providerJobId
        if (forOther) return

        switch (frame.type) {
          case 'execution_start':
            emit('running')
            return

          case 'progress_state': {
            // Current ComfyUI reports every active node at once. The bar the
            // web UI shows is the running node's own value/max, which for a
            // sampling graph is the sampler's step count.
            const nodes = (data.nodes ?? {}) as Record<
              string,
              { value?: number; max?: number; state?: string }
            >
            const running = Object.values(nodes)
              .filter((node) => node.state === 'running')
              .sort((a, b) => (b.max ?? 0) - (a.max ?? 0))[0]
            if (!running || !running.max) {
              emit('running')
              return
            }
            emit('running', {
              progress: Math.round(((running.value ?? 0) / running.max) * 100),
              step: { current: running.value ?? 0, total: running.max },
            })
            return
          }

          case 'progress': {
            // The legacy single-node frame, still emitted by nodes that call
            // `send_sync("progress", ...)` directly.
            const max = typeof data.max === 'number' ? data.max : undefined
            const value = typeof data.value === 'number' ? data.value : 0
            if (!max) {
              emit('running')
              return
            }
            emit('running', {
              progress: Math.round((value / max) * 100),
              step: { current: value, total: max },
            })
            return
          }

          case 'executed': {
            const node = typeof data.node === 'string' ? data.node : undefined
            const output = data.output as Record<string, unknown> | undefined
            if (node && output) collected[node] = output
            return
          }

          case 'execution_success':
            emit('succeeded', {
              progress: 100,
              outputs: outputsOf({ outputs: collected }),
            })
            stop()
            return

          case 'execution_interrupted':
            emit('cancelled')
            stop()
            return

          case 'execution_error':
            emit('failed', {
              error: {
                code:
                  typeof data.exception_type === 'string'
                    ? data.exception_type
                    : 'execution_error',
                message:
                  typeof data.exception_message === 'string'
                    ? data.exception_message
                    : 'ComfyUI reported the prompt failed but did not say why.',
                retryable: false,
              },
            })
            stop()
            return

          default:
        }
      }

      try {
        const url = `${base.replace(/^http/, 'ws')}/ws?clientId=${encodeURIComponent(clientId)}`
        socket = new WebSocket(url)
        socket.onopen = () => {
          // The server treats the first client frame as feature negotiation and
          // answers with its own flags. Declining preview metadata keeps the
          // stream to JSON frames this adapter can actually read.
          socket?.send(
            JSON.stringify({
              type: 'feature_flags',
              data: { supports_preview_metadata: false },
            })
          )
        }
        socket.onmessage = (event: MessageEvent) => handleMessage(event.data)
        socket.onerror = () => startFallback()
        socket.onclose = () => {
          if (!closed) startFallback()
        }
      } catch {
        startFallback()
      }

      return () => {
        closed = true
        stop()
        try {
          socket?.close()
        } catch {
          // Closing an already-dead socket is not an error the caller can act on.
        }
      }
    },

    async cancel(handle: MediaJobHandle): Promise<void> {
      const providerJobId =
        handle.provider_job_id ?? providerJobIds.get(handle.client_job_id)
      if (!providerJobId) {
        throw new ComfyUiError(
          `No ComfyUI prompt is known for client job "${handle.client_job_id}".`,
          'unknown_job'
        )
      }

      cancelled.add(providerJobId)

      // Both calls, always, and in this order: `/interrupt` only acts on the
      // prompt that is currently running, and `/queue` `delete` only acts on
      // ones that are still pending. Which of the two applies is a race the
      // caller cannot win by asking first.
      await request(
        '/interrupt',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ prompt_id: providerJobId }),
        },
        undefined
      )
      await request(
        '/queue',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ delete: [providerJobId] }),
        },
        undefined
      )
    },

    // No install: ComfyUI has no endpoint that fetches a checkpoint, and
    // features.install says so.
  }
}
