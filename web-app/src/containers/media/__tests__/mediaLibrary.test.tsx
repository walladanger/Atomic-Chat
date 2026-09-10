/**
 * Task 13 Step 1 - the media library that does not exist yet.
 *
 * Task 8 built the index, the asset records and the store, and Task 11 wired
 * materialisation so files actually land there. Nothing has ever RENDERED any
 * of it. These tests describe the surface that finally does, taken from the
 * plan's Step 1 list.
 *
 * Two of them exist because of decision D8, answered on 2026-09-10:
 *  - "Re-run" must reproduce the image, which means resubmitting the SAME seed;
 *  - "Re-run with a new seed" must change the seed and NOTHING else.
 * Before D8 neither could be honest, because the seed a provider chose was
 * unrecoverable. They are the reason D8 had to be settled before this task.
 *
 * The library is driven through `__setMediaLibrary`, the seam the store already
 * exposes, so the real store and the real components are exercised.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MediaLibrary } from '../MediaLibrary'
import type { MediaAsset } from '@/services/media/assets'
import type { MediaLibrary as MediaLibraryService } from '@/services/media/library'
import {
  __setMediaLibrary,
  useMediaLibraryStore,
} from '@/stores/media-library-store'

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
}))

function assetFor(
  id: string,
  overrides: Partial<MediaAsset> = {},
  provenance: Partial<MediaAsset['provenance']> = {}
): MediaAsset {
  return {
    asset_id: id,
    client_job_id: `job-${id}`,
    media_type: 'image',
    path: `C:/data/media/outputs/${id}.png`,
    mime: 'image/png',
    bytes: 2048,
    created_at: 1_757_000_000_000,
    ...overrides,
    provenance: {
      provider_id: 'worker',
      model_id: 'worker:sdxl',
      model_label: 'SDXL',
      task: 'text_to_image',
      params: { prompt: 'a red car', steps: 20, seed: 4242 },
      resolved_seed: 4242,
      app_version: '2.0.23',
      contract_version: 2,
      ...provenance,
    },
  }
}

/** A library backed by a plain array - no filesystem, no index.json. */
function fakeLibrary(initial: MediaAsset[]): MediaLibraryService {
  let assets = [...initial]
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((listener) => listener())

  return {
    load: async () => {},
    list: () => assets,
    add: async (next) => {
      assets = [...assets, ...next]
      notify()
    },
    remove: async (assetId) => {
      assets = assets.filter((entry) => entry.asset_id !== assetId)
      notify()
    },
    setFavourite: async (assetId, favourite) => {
      assets = assets.map((entry) =>
        entry.asset_id === assetId ? { ...entry, favourite } : entry
      )
      notify()
    },
    readOnly: () => false,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

function seed(assets: MediaAsset[]) {
  __setMediaLibrary(fakeLibrary(assets))
  useMediaLibraryStore.setState({
    assets: [],
    loading: false,
    loaded: false,
    readOnly: false,
  })
}

beforeEach(() => {
  __setMediaLibrary(undefined)
})

describe('the grid', () => {
  it('renders one tile per asset in the index', async () => {
    seed([assetFor('a'), assetFor('b'), assetFor('c')])

    render(<MediaLibrary />)

    await waitFor(() => {
      expect(screen.getAllByTestId('media-library-tile')).toHaveLength(3)
    })
  })

  it('says so plainly when nothing has been generated yet', async () => {
    seed([])

    render(<MediaLibrary />)

    expect(await screen.findByText(/nothing here yet/i)).toBeInTheDocument()
  })
})

describe('filtering', () => {
  it('filters by task', async () => {
    seed([
      assetFor('image-one'),
      assetFor('video-one', { media_type: 'video' }, { task: 'text_to_video' }),
    ])

    render(<MediaLibrary />)
    await waitFor(() =>
      expect(screen.getAllByTestId('media-library-tile')).toHaveLength(2)
    )

    fireEvent.change(screen.getByLabelText('Task'), {
      target: { value: 'text_to_video' },
    })

    const tiles = screen.getAllByTestId('media-library-tile')
    expect(tiles).toHaveLength(1)
    expect(within(tiles[0]!).getByText(/text_to_video/)).toBeInTheDocument()
  })

  it('filters by provider', async () => {
    seed([
      assetFor('from-worker'),
      assetFor('from-comfy', {}, { provider_id: 'comfy', model_label: 'Comfy' }),
    ])

    render(<MediaLibrary />)
    await waitFor(() =>
      expect(screen.getAllByTestId('media-library-tile')).toHaveLength(2)
    )

    fireEvent.change(screen.getByLabelText('Provider'), {
      target: { value: 'comfy' },
    })

    expect(screen.getAllByTestId('media-library-tile')).toHaveLength(1)
    expect(screen.getByText('Comfy')).toBeInTheDocument()
  })
})

describe('the detail view', () => {
  it('shows the provenance that was actually recorded', async () => {
    seed([assetFor('a')])

    render(<MediaLibrary />)
    fireEvent.click(await screen.findByTestId('media-library-tile'))

    const detail = await screen.findByTestId('media-asset-detail')
    expect(within(detail).getByText('SDXL')).toBeInTheDocument()
    expect(within(detail).getByText(/a red car/)).toBeInTheDocument()
    expect(within(detail).getByText(/4242/)).toBeInTheDocument()
  })

  it('is honest when the seed was never recorded', async () => {
    // Pre-D8 assets exist on disk already and cannot be retro-fitted. Showing
    // "unknown" is the truthful rendering; inventing a 0 would make a re-run
    // silently produce a different image.
    seed([assetFor('old', {}, { resolved_seed: undefined, params: { prompt: 'x' } })])

    render(<MediaLibrary />)
    fireEvent.click(await screen.findByTestId('media-library-tile'))

    const detail = await screen.findByTestId('media-asset-detail')
    expect(within(detail).getByText(/not recorded/i)).toBeInTheDocument()
  })
})

describe('re-run', () => {
  it('reproduces the generation exactly, seed included', async () => {
    seed([assetFor('a')])
    const onReRun = vi.fn()

    render(<MediaLibrary onReRun={onReRun} />)
    fireEvent.click(await screen.findByTestId('media-library-tile'))
    fireEvent.click(await screen.findByRole('button', { name: 'Re-run' }))

    expect(onReRun.mock.calls[0]![0]).toEqual({
      provider_id: 'worker',
      model_id: 'worker:sdxl',
      task: 'text_to_image',
      params: { prompt: 'a red car', steps: 20, seed: 4242 },
    })
  })

  it('changes the seed and nothing else when asked for a new one', async () => {
    seed([assetFor('a')])
    const onReRun = vi.fn()

    render(<MediaLibrary onReRun={onReRun} />)
    fireEvent.click(await screen.findByTestId('media-library-tile'))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Re-run with a new seed' })
    )

    const request = onReRun.mock.calls[0]![0] as {
      params: Record<string, unknown>
    }
    // The seed is dropped rather than replaced here: the job manager resolves a
    // blank seed (D8), so dropping it is what "give me a different one" means,
    // and it keeps a single place responsible for choosing seeds.
    expect(request.params).not.toHaveProperty('seed')
    expect(request.params).toMatchObject({ prompt: 'a red car', steps: 20 })
  })

  it('refuses to offer an exact re-run it cannot honour', async () => {
    seed([assetFor('old', {}, { resolved_seed: undefined, params: { prompt: 'x' } })])

    render(<MediaLibrary onReRun={vi.fn()} />)
    fireEvent.click(await screen.findByTestId('media-library-tile'))

    // No recorded seed means "run this again identically" is a promise the app
    // cannot keep, so it is not offered. A new-seed run still makes sense.
    expect(screen.queryByRole('button', { name: 'Re-run' })).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Re-run with a new seed' })
    ).toBeInTheDocument()
  })
})

describe('delete', () => {
  it('removes the asset from the library', async () => {
    seed([assetFor('a'), assetFor('b')])

    render(<MediaLibrary />)
    await waitFor(() =>
      expect(screen.getAllByTestId('media-library-tile')).toHaveLength(2)
    )

    fireEvent.click(screen.getAllByTestId('media-library-tile')[0]!)
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(screen.getAllByTestId('media-library-tile')).toHaveLength(1)
    })
    expect(useMediaLibraryStore.getState().assets).toHaveLength(1)
  })
})

describe('a file that is no longer there', () => {
  it('renders a placeholder rather than a broken image', async () => {
    seed([assetFor('gone')])

    render(<MediaLibrary />)
    const image = await screen.findByTestId('media-library-thumb')

    // The file was deleted outside the app; the index still lists it.
    fireEvent.error(image)

    expect(await screen.findByTestId('media-library-missing')).toBeInTheDocument()
    expect(screen.queryByTestId('media-library-thumb')).toBeNull()
  })
})
