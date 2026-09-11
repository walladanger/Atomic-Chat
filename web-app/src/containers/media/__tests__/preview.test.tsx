/**
 * Task 11 Step 6 - the preview, and the CSP invariant behind it.
 *
 * The v1 preview passed an `https:` output path straight through to the `src`
 * of an `<img>` or `<video>`. That looked like it worked and did not: verified
 * in src-tauri/tauri.conf.json, `img-src` allows `https:` but `media-src` does
 * NOT, so a remote image rendered while a remote video was silently blocked by
 * the content-security policy with nothing on screen to say why.
 *
 * Decision Q4 settled the fix: always materialise. Every provider output is
 * downloaded to a local file first, so the preview only ever points at a local
 * path and the CSP is left alone rather than widened for the whole app. The
 * passthrough is therefore deleted, and the test below that no rendered src is
 * ever remote is what keeps it deleted.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { MediaPreview } from '../MediaPreview'
import type { MediaAsset } from '@/services/media/assets'

vi.mock('@tauri-apps/api/core', () => ({
  // The real one returns an asset:// or http://asset.localhost URL. What
  // matters here is only that the local path is handed to it, never bypassed.
  convertFileSrc: (path: string) => `asset://localhost/${path}`,
}))

function asset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    asset_id: 'asset-1',
    client_job_id: 'job-1',
    media_type: 'image',
    path: 'D:/media/outputs/out.png',
    mime: 'image/png',
    bytes: 1024,
    created_at: 0,
    provenance: {
      provider_id: 'alpha',
      model_id: 'alpha:sdxl',
      task: 'text_to_image',
      params: {},
    } as MediaAsset['provenance'],
    ...overrides,
  }
}

describe('MediaPreview', () => {
  it('renders an image through the asset protocol', () => {
    render(<MediaPreview asset={asset()} />)

    expect(screen.getByTestId('media-image-preview')).toHaveAttribute(
      'src',
      'asset://localhost/D:/media/outputs/out.png'
    )
  })

  it('renders a video player for a video asset', () => {
    render(
      <MediaPreview
        asset={asset({
          media_type: 'video',
          path: 'D:/media/outputs/out.mp4',
          mime: 'video/mp4',
        })}
      />
    )

    const video = screen.getByTestId('media-video-preview')
    expect(video).toHaveAttribute('src', 'asset://localhost/D:/media/outputs/out.mp4')
    expect(video).toHaveAttribute('controls')
  })

  it('renders an audio player for an audio asset', () => {
    render(
      <MediaPreview
        asset={asset({
          media_type: 'audio',
          path: 'D:/media/outputs/out.wav',
          mime: 'audio/wav',
        })}
      />
    )

    expect(screen.getByTestId('media-audio-preview')).toHaveAttribute(
      'src',
      'asset://localhost/D:/media/outputs/out.wav'
    )
  })

  it('explains an output it cannot play instead of rendering a broken player', () => {
    render(
      <MediaPreview
        asset={asset({
          media_type: 'unknown',
          path: 'D:/media/outputs/out.glb',
          mime: 'model/gltf-binary',
        })}
      />
    )

    expect(screen.getByTestId('media-unknown-preview')).toBeInTheDocument()
    expect(screen.queryByTestId('media-image-preview')).toBeNull()
    expect(screen.queryByTestId('media-video-preview')).toBeNull()
  })

  it('never points at a remote URL, whatever the asset claims', () => {
    // The materialisation invariant means this should be unreachable. If it
    // ever is reached, failing closed is the only safe behaviour: media-src
    // would block it anyway, and a silent black box is the bug Q4 removed.
    const { container } = render(
      <MediaPreview
        asset={asset({ path: 'https://cdn.example.com/out.png' })}
      />
    )

    const sources = Array.from(container.querySelectorAll('[src]')).map((node) =>
      node.getAttribute('src')
    )
    for (const src of sources) {
      expect(src?.startsWith('http://')).toBe(false)
      expect(src?.startsWith('https://')).toBe(false)
    }
  })

  it('shows the empty state when nothing has been generated', () => {
    render(<MediaPreview asset={null} />)

    expect(screen.getByText('Generation preview')).toBeInTheDocument()
    expect(screen.queryByTestId('media-image-preview')).toBeNull()
  })
})
