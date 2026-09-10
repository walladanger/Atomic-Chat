/**
 * Task 11 - the join between the job manager and the media library.
 *
 * Task 8 built `materialize()` and the library store and left them unwired:
 * nothing called them, because the job manager does not know the library
 * exists and the plan puts that meeting point here. This hook is that point.
 *
 * The behaviour that matters is not "it materialises" but WHEN and HOW OFTEN.
 * A generation can cost real money on a cloud provider and a video can be
 * hundreds of megabytes, so materialising twice is not a cosmetic bug.
 */
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useMediaJobAsset } from './useMediaJobAsset'
import type { MediaJobEntry } from '@/services/media/jobManager'
import type { MediaAsset, MaterializeDeps } from '@/services/media/assets'
import { __setMediaLibrary, useMediaLibraryStore } from '@/stores/media-library-store'

const added: MediaAsset[][] = []

function fakeAsset(id: string): MediaAsset {
  return {
    asset_id: id,
    client_job_id: 'job-1',
    media_type: 'image',
    path: `D:/media/outputs/${id}.png`,
    mime: 'image/png',
    bytes: 10,
    created_at: 0,
    provenance: {
      provider_id: 'alpha',
      model_id: 'alpha:sdxl',
      model_label: 'SDXL',
      task: 'text_to_image',
      params: {},
      app_version: 'test',
      contract_version: 2,
    },
  }
}

function entry(overrides: Partial<MediaJobEntry> = {}): MediaJobEntry {
  return {
    client_job_id: 'job-1',
    provider_id: 'alpha',
    state: 'succeeded',
    outputs: [{ kind: 'local_path', path: 'D:/raw/out.png' }],
    submitted_at: 0,
    cancellable: false,
    request: {
      client_job_id: 'job-1',
      provider_id: 'alpha',
      model_id: 'alpha:sdxl',
      task: 'text_to_image',
      params: { prompt: 'a cat' },
    },
    ...overrides,
  } as MediaJobEntry
}

beforeEach(() => {
  added.length = 0
  __setMediaLibrary({
    list: () => [],
    readOnly: () => false,
    load: vi.fn(async () => {}),
    add: vi.fn(async (assets: MediaAsset[]) => {
      added.push(assets)
    }),
    remove: vi.fn(async () => {}),
    setFavourite: vi.fn(async () => {}),
  } as never)
  useMediaLibraryStore.setState({ assets: [], loaded: true })
})

function deps(materialize: MaterializeDeps['fetchBytes'] | undefined = undefined) {
  void materialize
  return {} as MaterializeDeps
}

describe('useMediaJobAsset', () => {
  it('materialises a succeeded job and returns its first asset', async () => {
    const run = vi.fn(async () => [fakeAsset('a1')])

    const { result } = renderHook(() =>
      useMediaJobAsset(entry(), 'SDXL', deps(), run)
    )

    await waitFor(() => expect(result.current?.asset_id).toBe('a1'))
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('does not materialise a job that is still running', async () => {
    const run = vi.fn(async () => [fakeAsset('a1')])

    const { result } = renderHook(() =>
      useMediaJobAsset(entry({ state: 'running' }), 'SDXL', deps(), run)
    )

    await Promise.resolve()
    expect(run).not.toHaveBeenCalled()
    expect(result.current).toBeNull()
  })

  it('materialises a given job exactly once, however often it re-renders', async () => {
    const run = vi.fn(async () => [fakeAsset('a1')])
    const job = entry()

    const { result, rerender } = renderHook(() =>
      useMediaJobAsset(job, 'SDXL', deps(), run)
    )
    await waitFor(() => expect(result.current).not.toBeNull())

    rerender()
    rerender()

    // A second run would re-download the bytes and, on a paid provider, could
    // re-charge for them.
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('adds what it materialised to the library', async () => {
    const run = vi.fn(async () => [fakeAsset('a1'), fakeAsset('a2')])

    const { result } = renderHook(() =>
      useMediaJobAsset(entry(), 'SDXL', deps(), run)
    )

    await waitFor(() => expect(result.current).not.toBeNull())
    expect(added).toEqual([[fakeAsset('a1'), fakeAsset('a2')]])
  })

  it('carries the provenance context materialisation needs', async () => {
    const run = vi.fn(async () => [fakeAsset('a1')])

    renderHook(() => useMediaJobAsset(entry(), 'SDXL', deps(), run))

    await waitFor(() => expect(run).toHaveBeenCalled())
    const context = run.mock.calls[0]?.[1]
    expect(context).toMatchObject({
      model_label: 'SDXL',
      app_version: 'test',
    })
    expect(context?.request.model_id).toBe('alpha:sdxl')
  })

  it('survives a failed materialisation instead of taking the screen down', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const run = vi.fn(async () => {
      throw new Error('disk full')
    })

    const { result } = renderHook(() =>
      useMediaJobAsset(entry(), 'SDXL', deps(), run)
    )

    await waitFor(() => expect(warn).toHaveBeenCalled())
    expect(result.current).toBeNull()
    expect(added).toEqual([])
    warn.mockRestore()
  })

  it('materialises the next job too, rather than latching on the first', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce([fakeAsset('a1')])
      .mockResolvedValueOnce([fakeAsset('a2')])

    const { result, rerender } = renderHook(
      ({ job }) => useMediaJobAsset(job, 'SDXL', deps(), run),
      { initialProps: { job: entry() } }
    )
    await waitFor(() => expect(result.current?.asset_id).toBe('a1'))

    rerender({ job: entry({ client_job_id: 'job-2' }) })

    await waitFor(() => expect(result.current?.asset_id).toBe('a2'))
    expect(run).toHaveBeenCalledTimes(2)
  })
})
