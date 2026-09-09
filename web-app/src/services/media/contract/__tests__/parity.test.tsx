/**
 * The acceptance test for plan section 5.1.
 *
 * It drives the REAL MediaGenerationForm with a v1 capabilities payload, then
 * drives the v2 contract path with the same user input, and asserts the two
 * produce a byte-identical worker request. Nothing here restates what the form
 * does - it asks the form itself, so the assertion cannot drift from reality.
 *
 * Task 11 refits the Media surface onto the contract. This test is what must
 * still pass afterwards, so it is deliberately written against the form's
 * public behaviour (labels and the submitted body) rather than its internals.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { MediaGenerationForm } from '@/containers/media/MediaGenerationForm'
import type {
  AtomicMediaCapabilities,
  AtomicMediaJobRequest,
} from '@/services/atomicMedia/types'

import { downcastV2Request, upcastV1Capabilities } from '../upcast'
import { validateParams } from '../params'
import type { MediaParamSpec } from '../params'
import fixture from './fixtures/worker-v1-capabilities.json'

const v1 = fixture.payload as AtomicMediaCapabilities
const PROVIDER = 'atomic-media-worker'
const PROMPT = 'a cat in a hat'

/** What the live form submits for the given user input. */
function v1BodyFromForm(
  task: 'text_to_video' | 'image_to_video',
  extra: (() => void) | undefined
): AtomicMediaJobRequest {
  const submit = vi.fn()
  render(<MediaGenerationForm capabilities={v1} onSubmit={submit} />)

  if (task === 'image_to_video') {
    fireEvent.click(screen.getByRole('button', { name: 'Image → Video' }))
  }
  fireEvent.change(screen.getByLabelText('Prompt'), {
    target: { value: PROMPT },
  })
  extra?.()
  fireEvent.click(screen.getByRole('button', { name: 'Generate' }))

  expect(submit).toHaveBeenCalledTimes(1)
  return submit.mock.calls[0]?.[0] as AtomicMediaJobRequest
}

/**
 * Seed the contract path from the upcast schema's own defaults. Hardcoding the
 * values here would only prove downcast works; taking them from the schema also
 * proves the upcaster reproduced v1's defaults.
 */
function valuesFromSchema(specs: MediaParamSpec[]): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const entry of specs) {
    if (entry.default !== undefined) values[entry.id] = entry.default
  }
  return values
}

/** What the v2 contract path submits for the same user input. */
function v1BodyFromContract(
  task: 'text_to_video' | 'image_to_video',
  overrides: Record<string, unknown> = {}
): AtomicMediaJobRequest {
  const capabilities = upcastV1Capabilities(v1, PROVIDER)
  const model = capabilities.models[0]
  if (!model) throw new Error('fixture produced no models')

  const specs = model.params[task] ?? []
  const values = { ...valuesFromSchema(specs), prompt: PROMPT, ...overrides }
  const validated = validateParams(specs, values)
  expect(validated.ok).toBe(true)

  return downcastV2Request(
    {
      client_job_id: '01JCLIENTJOBID0000000000',
      provider_id: PROVIDER,
      model_id: model.id,
      task,
      params: validated.values,
      device: model.fitness?.required_device ?? capabilities.devices[0]?.id,
    },
    model
  )
}

describe('v1 form / v2 contract parity', () => {
  it('produces a byte-identical text_to_video body at the form defaults', () => {
    const fromForm = v1BodyFromForm('text_to_video', undefined)
    const fromContract = v1BodyFromContract('text_to_video')

    expect(fromContract).toEqual(fromForm)
    expect(JSON.stringify(fromContract)).toBe(JSON.stringify(fromForm))
  })

  it('produces a byte-identical body with a negative prompt and a seed', () => {
    const fromForm = v1BodyFromForm('text_to_video', () => {
      fireEvent.change(screen.getByLabelText('Negative prompt'), {
        target: { value: 'blurry, low detail' },
      })
      fireEvent.change(screen.getByLabelText('Seed'), {
        target: { value: '42' },
      })
    })
    const fromContract = v1BodyFromContract('text_to_video', {
      negative_prompt: 'blurry, low detail',
      seed: '42',
    })

    expect(JSON.stringify(fromContract)).toBe(JSON.stringify(fromForm))
  })

  it('produces a byte-identical body at a non-default resolution', () => {
    const fromForm = v1BodyFromForm('text_to_video', () => {
      fireEvent.change(screen.getByLabelText('Resolution'), {
        target: { value: '1280x704' },
      })
    })
    const fromContract = v1BodyFromContract('text_to_video', {
      resolution: '1280x704',
    })

    expect(JSON.stringify(fromContract)).toBe(JSON.stringify(fromForm))
  })

  it('quantises frames the same way the form does, including the tie', () => {
    // 19 is equidistant between 17 and 21 under {modulus: 4, offset: 1}. v1's
    // nearestFrame breaks the tie downwards; the contract must agree or the
    // submitted body diverges.
    const fromForm = v1BodyFromForm('text_to_video', () => {
      fireEvent.change(screen.getByLabelText('Frames'), {
        target: { value: '19' },
      })
    })
    const fromContract = v1BodyFromContract('text_to_video', {
      num_frames: 19,
    })

    expect(fromForm.num_frames).toBe(17)
    expect(JSON.stringify(fromContract)).toBe(JSON.stringify(fromForm))
  })

  it('produces a byte-identical image_to_video body with a reference image', () => {
    const path = 'D:\\Images\\reference.png'
    const fromForm = v1BodyFromForm('image_to_video', () => {
      fireEvent.change(screen.getByLabelText('Reference image path'), {
        target: { value: path },
      })
    })
    const fromContract = v1BodyFromContract('image_to_video', {
      input_image: path,
    })

    expect(JSON.stringify(fromContract)).toBe(JSON.stringify(fromForm))
  })

  it('offers exactly the controls the form renders, and no others', () => {
    render(<MediaGenerationForm capabilities={v1} onSubmit={vi.fn()} />)

    const model = upcastV1Capabilities(v1, PROVIDER).models[0]
    const ids = new Set((model?.params.text_to_video ?? []).map((s) => s.id))

    // Every param the contract declares has a matching control today.
    const controlForParam: Record<string, string> = {
      prompt: 'Prompt',
      negative_prompt: 'Negative prompt',
      resolution: 'Resolution',
      steps: 'Steps',
      guidance_scale: 'Guidance',
      num_frames: 'Frames',
      fps: 'FPS',
      seed: 'Seed',
    }
    for (const id of ids) {
      expect(screen.getByLabelText(controlForParam[id] ?? id)).toBeTruthy()
    }
    // And nothing the contract declares is missing from that list.
    expect([...ids].sort()).toEqual(Object.keys(controlForParam).sort())
  })
})
