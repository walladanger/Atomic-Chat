/**
 * The acceptance test for plan section 5.1, now the refit has landed.
 *
 * BEFORE Task 11 this test drove the v1 form and the v2 contract path side by
 * side and asserted they emitted a byte-identical worker request. The v1 form
 * no longer exists - Task 11 replaced its hand-written controls with the
 * schema renderer - so "side by side" is no longer available.
 *
 * What replaces it is stronger, not weaker. The v1 bodies that form produced
 * were captured while it still existed and are frozen in `V1_BODY` below. This
 * test drives the REAL refitted form, takes the `NormalizedMediaRequest` it
 * submits, puts it through the REAL downcaster, and asserts the result is
 * byte-identical to what v1 sent. Nothing here restates what the form does; it
 * asks the form itself, end to end, exactly as the worker would see it.
 *
 * If this passes, a running Atomic Media Worker cannot tell that the entire UI
 * was rewritten underneath it.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { MediaGenerationForm } from '@/containers/media/MediaGenerationForm'
import type {
  AtomicMediaCapabilities,
  AtomicMediaJobRequest,
} from '@/services/atomicMedia/types'

import { downcastV2Request, upcastV1Capabilities } from '../upcast'
import type { MediaProviderDescriptor, NormalizedMediaRequest } from '../jobs'
import fixture from './fixtures/worker-v1-capabilities.json'

const v1 = fixture.payload as AtomicMediaCapabilities
const PROVIDER = 'atomic-media-worker'
const PROMPT = 'a cat in a hat'

/**
 * The bodies the v1 MediaGenerationForm submitted for this fixture, captured
 * from the live component before Task 11 removed it.
 *
 * Key ORDER matters as much as key content - these are compared with
 * JSON.stringify - and it is the order v1's object literal produced.
 */
const V1_BODY = {
  defaults: {
    kind: 'text_to_video',
    prompt: PROMPT,
    device: 'cuda:0',
    model_id: 'registry-video',
    width: 832,
    height: 480,
    steps: 10,
    guidance_scale: 5,
    num_frames: 17,
    fps: 12,
  },
  withNegativeAndSeed: {
    kind: 'text_to_video',
    prompt: PROMPT,
    device: 'cuda:0',
    model_id: 'registry-video',
    width: 832,
    height: 480,
    steps: 10,
    guidance_scale: 5,
    negative_prompt: 'blurry, low detail',
    seed: 42,
    num_frames: 17,
    fps: 12,
  },
  atOtherResolution: {
    kind: 'text_to_video',
    prompt: PROMPT,
    device: 'cuda:0',
    model_id: 'registry-video',
    width: 1280,
    height: 704,
    steps: 10,
    guidance_scale: 5,
    num_frames: 17,
    fps: 12,
  },
  imageToVideo: {
    kind: 'image_to_video',
    prompt: PROMPT,
    device: 'cuda:0',
    model_id: 'registry-video',
    width: 832,
    height: 480,
    steps: 10,
    guidance_scale: 5,
    num_frames: 17,
    fps: 12,
    input_image: 'D:\\Images\\reference.png',
  },
} satisfies Record<string, AtomicMediaJobRequest>

const capabilities = upcastV1Capabilities(v1, PROVIDER)
const model = capabilities.models[0]
if (!model) throw new Error('fixture produced no models')

const descriptor: MediaProviderDescriptor = {
  id: PROVIDER,
  label: 'Atomic Media Worker',
  kind: 'local_worker',
  adapter: 'atomic-media-worker',
  enabled: true,
  origin: 'builtin',
}

/** Reveal the parameters the schema marks advanced, such as the seed. */
function showAdvanced() {
  fireEvent.click(screen.getByRole('button', { name: 'Show advanced' }))
}

/**
 * The v1 wire body the REFITTED form produces for the given user input.
 *
 * Deliberately end to end: render the real component, drive it the way a
 * person would, take what it submits, and downcast it with the real downcaster.
 */
function v1BodyFrom(
  task: 'text_to_video' | 'image_to_video',
  extra?: () => void
): AtomicMediaJobRequest {
  const submit = vi.fn()

  render(
    <MediaGenerationForm
      tasks={capabilities.tasks ?? []}
      task={task}
      onTaskChange={vi.fn()}
      models={[model]}
      providers={[descriptor]}
      devices={capabilities.devices}
      selectedModelId={model.id}
      onSelectModel={vi.fn()}
      onSubmit={submit}
    />
  )

  fireEvent.change(screen.getByLabelText('Prompt'), {
    target: { value: PROMPT },
  })
  extra?.()
  fireEvent.click(screen.getByRole('button', { name: 'Generate' }))

  expect(submit).toHaveBeenCalledTimes(1)
  const request = submit.mock.calls[0]?.[0] as NormalizedMediaRequest

  return downcastV2Request(request, model)
}

describe('the refitted form still speaks v1 to the worker', () => {
  it('produces the byte-identical text_to_video body at the schema defaults', () => {
    const body = v1BodyFrom('text_to_video')

    expect(body).toEqual(V1_BODY.defaults)
    expect(JSON.stringify(body)).toBe(JSON.stringify(V1_BODY.defaults))
  })

  it('produces the byte-identical body with a negative prompt and a seed', () => {
    const body = v1BodyFrom('text_to_video', () => {
      fireEvent.change(screen.getByLabelText('Negative prompt'), {
        target: { value: 'blurry, low detail' },
      })
      showAdvanced()
      fireEvent.change(screen.getByLabelText('Seed'), {
        target: { value: '42' },
      })
    })

    expect(JSON.stringify(body)).toBe(
      JSON.stringify(V1_BODY.withNegativeAndSeed)
    )
  })

  it('produces the byte-identical body at a non-default resolution', () => {
    const body = v1BodyFrom('text_to_video', () => {
      fireEvent.change(screen.getByLabelText('Resolution'), {
        target: { value: '1280x704' },
      })
    })

    expect(JSON.stringify(body)).toBe(JSON.stringify(V1_BODY.atOtherResolution))
  })

  it('quantises frames the way v1 did, including the tie', () => {
    // 19 is equidistant between 17 and 21 under {modulus: 4, offset: 1}. v1's
    // nearestFrame broke the tie downwards; the contract must agree or every
    // submitted body diverges.
    const body = v1BodyFrom('text_to_video', () => {
      const frames = screen.getByLabelText('Frames')
      fireEvent.change(frames, { target: { value: '19' } })
      fireEvent.blur(frames)
    })

    expect(body.num_frames).toBe(17)
    expect(JSON.stringify(body)).toBe(JSON.stringify(V1_BODY.defaults))
  })

  it('produces the byte-identical image_to_video body with a reference image', () => {
    const body = v1BodyFrom('image_to_video', () => {
      fireEvent.change(screen.getByLabelText('Input image'), {
        target: { value: 'D:\\Images\\reference.png' },
      })
    })

    expect(JSON.stringify(body)).toBe(JSON.stringify(V1_BODY.imageToVideo))
  })

  it('renders a control for every parameter the contract declares', () => {
    const submit = vi.fn()
    render(
      <MediaGenerationForm
        tasks={capabilities.tasks ?? []}
        task="text_to_video"
        onTaskChange={vi.fn()}
        models={[model]}
        providers={[descriptor]}
        devices={capabilities.devices}
        selectedModelId={model.id}
        onSelectModel={vi.fn()}
        onSubmit={submit}
      />
    )
    showAdvanced()

    // The aria-labels the renderer assigns, keyed by the contract's param id.
    const labelForParam: Record<string, string> = {
      prompt: 'Prompt',
      negative_prompt: 'Negative prompt',
      resolution: 'Resolution',
      steps: 'Steps',
      guidance_scale: 'Guidance',
      num_frames: 'Frames',
      fps: 'FPS',
      seed: 'Seed',
    }

    const ids = (model.params.text_to_video ?? []).map((spec) => spec.id)
    for (const id of ids) {
      expect(screen.getByLabelText(labelForParam[id] ?? id)).toBeTruthy()
    }
    // And the list above describes the contract exactly, with nothing left over.
    expect([...ids].sort()).toEqual(Object.keys(labelForParam).sort())
  })
})
