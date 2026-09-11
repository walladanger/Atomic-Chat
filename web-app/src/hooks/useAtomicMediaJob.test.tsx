import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAtomicMediaJob } from './useAtomicMediaJob'
import type {
  AtomicMediaHealth,
  AtomicMediaCapabilities,
  AtomicMediaJobRequest,
  AtomicMediaJobSnapshot,
} from '@/services/atomicMedia/types'

type FakeClient = {
  health: ReturnType<typeof vi.fn<() => Promise<AtomicMediaHealth>>>
  createJob: ReturnType<
    typeof vi.fn<(request: AtomicMediaJobRequest) => Promise<AtomicMediaJobSnapshot>>
  >
  getJob: ReturnType<
    typeof vi.fn<(jobId: string) => Promise<AtomicMediaJobSnapshot>>
  >
  capabilities: ReturnType<
    typeof vi.fn<() => Promise<AtomicMediaCapabilities | null>>
  >
}

const request: AtomicMediaJobRequest = {
  kind: 'text_to_video',
  prompt: 'test',
  device: 'auto',
  width: 832,
  height: 480,
  num_frames: 17,
  steps: 10,
  fps: 12,
  guidance_scale: 5,
}

function makeClient(): FakeClient {
  return {
    health: vi.fn().mockResolvedValue({
      service: 'atomic-media-worker',
      version: '0.6.1',
      status: 'ok',
    }),
    createJob: vi.fn().mockResolvedValue({
      job_id: 'job-1',
      status: 'queued',
      kind: 'text_to_video',
    }),
    getJob: vi.fn(),
    capabilities: vi.fn().mockResolvedValue({
      contract_version: 1,
      devices: [{ id: 'cuda:0', label: 'RTX 3090', backend: 'cuda' }],
      models: [],
      recommended: [],
    }),
  }
}

describe('useAtomicMediaJob', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reports an offline worker without throwing from the hook', async () => {
    const client = makeClient()
    client.health.mockRejectedValue(new Error('offline'))

    const { result } = renderHook(() => useAtomicMediaJob(client))

    await act(async () => {
      await result.current.refreshHealth()
    })

    expect(result.current.workerState).toBe('offline')
    expect(result.current.workerHealth).toBeNull()
  })

  it('loads worker capabilities after a successful health check', async () => {
    const client = makeClient()
    const { result } = renderHook(() => useAtomicMediaJob(client))

    await act(async () => {
      await result.current.refreshHealth()
    })

    expect(client.capabilities).toHaveBeenCalled()
    expect(result.current.capabilities).toMatchObject({
      contract_version: 1,
      devices: [{ id: 'cuda:0', label: 'RTX 3090' }],
    })
  })

  it('submits a job and polls queued to running to succeeded', async () => {
    const client = makeClient()
    client.getJob
      .mockResolvedValueOnce({ job_id: 'job-1', status: 'running' })
      .mockResolvedValueOnce({
        job_id: 'job-1',
        status: 'succeeded',
        output_path: 'D:/outputs/job-1.mp4',
      })

    const { result } = renderHook(() => useAtomicMediaJob(client, 100))

    await act(async () => {
      await result.current.submit(request)
    })
    expect(result.current.job?.status).toBe('queued')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(result.current.job?.status).toBe('running')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(result.current.job?.status).toBe('succeeded')
    expect(client.getJob).toHaveBeenCalledTimes(2)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    expect(client.getJob).toHaveBeenCalledTimes(2)
  })

  it('stops polling after a failed terminal job', async () => {
    const client = makeClient()
    client.getJob.mockResolvedValue({
      job_id: 'job-1',
      status: 'failed',
      error: 'generation failed',
    })

    const { result } = renderHook(() => useAtomicMediaJob(client, 100))
    await act(async () => {
      await result.current.submit(request)
      await vi.advanceTimersByTimeAsync(100)
    })

    expect(result.current.job?.status).toBe('failed')
    expect(result.current.error).toBe('generation failed')
  })

  it('cancels pending polling on unmount', async () => {
    const client = makeClient()
    client.getJob.mockResolvedValue({ job_id: 'job-1', status: 'running' })

    const { result, unmount } = renderHook(() =>
      useAtomicMediaJob(client, 100)
    )
    await act(async () => {
      await result.current.submit(request)
    })

    // Without this the assertion below could pass vacuously: if submit never
    // established a non-terminal job, there would be no scheduled poll to cancel
    // and getJob would stay uncalled for the wrong reason.
    expect(result.current.job?.job_id).toBe('job-1')
    expect(result.current.job?.status).toBe('queued')

    unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    expect(client.getJob).not.toHaveBeenCalled()
  })
})
