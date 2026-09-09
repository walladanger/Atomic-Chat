import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AtomicMediaJobRequest } from './types'

import { AtomicMediaClient, AtomicMediaClientError } from './client'

// A representative video request, local to this test. It used to be
// ATOMIC_MEDIA_DEFAULT_VIDEO_REQUEST exported from client.ts, but shipping one
// model's defaults inside the client is coupling C8: the client has no business
// knowing what a good frame count is. Only these tests ever needed it.
const videoRequest: Omit<AtomicMediaJobRequest, 'prompt'> = {
  kind: 'text_to_video',
  device: 'auto',
  width: 832,
  height: 480,
  num_frames: 17,
  steps: 10,
  fps: 12,
  guidance_scale: 5,
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AtomicMediaClient', () => {
  it('reads worker health from loopback', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          service: 'atomic-media-worker',
          version: '0.6.1',
          status: 'ok',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = new AtomicMediaClient()
    await expect(client.health()).resolves.toEqual({
      service: 'atomic-media-worker',
      version: '0.6.1',
      status: 'ok',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:13420/health',
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('normalizes worker network failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))

    const client = new AtomicMediaClient()
    await expect(client.health()).rejects.toMatchObject({
      name: 'AtomicMediaClientError',
      code: 'network_error',
    })
  })

  it('posts exact video job parameters without dropping explicit overrides', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          job_id: 'job-123',
          status: 'queued',
          kind: 'text_to_video',
          prompt: 'A red sports car exits a garage',
          requested_device: 'auto',
          width: 832,
          height: 480,
          num_frames: 17,
          steps: 10,
          fps: 12,
          guidance_scale: 5,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = new AtomicMediaClient()
    await client.createJob({
      ...videoRequest,
      prompt: 'A red sports car exits a garage',
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    })
    expect(JSON.parse(init.body as string)).toEqual({
      kind: 'text_to_video',
      prompt: 'A red sports car exits a garage',
      device: 'auto',
      width: 832,
      height: 480,
      num_frames: 17,
      steps: 10,
      fps: 12,
      guidance_scale: 5,
    })
  })

  it('parses a terminal job snapshot', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            job_id: 'job-123',
            status: 'succeeded',
            kind: 'text_to_video',
            output_path: 'D:/AtomicMedia/outputs/jobs/job-123.mp4',
            selected_device: 'cuda:0',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    )

    const client = new AtomicMediaClient()
    await expect(client.getJob('job-123')).resolves.toMatchObject({
      job_id: 'job-123',
      status: 'succeeded',
      output_path: 'D:/AtomicMedia/outputs/jobs/job-123.mp4',
    })
  })

  it('treats missing capabilities endpoint as optional', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: 'Not Found' }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        })
      )
    )

    const client = new AtomicMediaClient()
    await expect(client.capabilities()).resolves.toBeNull()
  })

  it('throws a structured error for non-2xx worker responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: 'invalid width' }), {
          status: 422,
          headers: { 'content-type': 'application/json' },
        })
      )
    )

    const client = new AtomicMediaClient()
    await expect(
      client.createJob({
        ...videoRequest,
        prompt: 'test',
      })
    ).rejects.toBeInstanceOf(AtomicMediaClientError)
  })
})
