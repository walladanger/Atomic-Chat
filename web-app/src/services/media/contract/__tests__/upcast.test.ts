import { describe, expect, it, vi } from 'vitest'

import type { AtomicMediaCapabilities } from '@/services/atomicMedia/types'

import { downcastV2Request, upcastV1Capabilities } from '../upcast'
import { validateParams } from '../params'
import type { MediaModelDescriptor } from '../models'
import type { NormalizedMediaRequest } from '../jobs'
import fixture from './fixtures/worker-v1-capabilities.json'

const v1 = fixture.payload as AtomicMediaCapabilities
const PROVIDER = 'atomic-media-worker'

function upcasted() {
  return upcastV1Capabilities(v1, PROVIDER)
}

function model(): MediaModelDescriptor {
  const found = upcasted().models[0]
  if (!found) throw new Error('fixture produced no models')
  return found
}

function paramIds(task: string): string[] {
  return (model().params[task] ?? []).map((spec) => spec.id)
}

function spec(task: string, id: string) {
  return (model().params[task] ?? []).find((entry) => entry.id === id)
}

/**
 * The v1 body the current MediaGenerationForm submits for this fixture at its
 * own defaults. Locked here as the parity target; parity.test.tsx proves this
 * really is what the live form emits, so the two must be changed together.
 */
const FORM_DEFAULT_BODY = {
  kind: 'text_to_video',
  prompt: 'a cat in a hat',
  device: 'cuda:0',
  model_id: 'registry-video',
  width: 832,
  height: 480,
  steps: 10,
  guidance_scale: 5,
  num_frames: 17,
  fps: 12,
}

function requestAt(
  task: string,
  values: Record<string, unknown>
): NormalizedMediaRequest {
  const validated = validateParams(model().params[task] ?? [], values)
  return {
    client_job_id: '01JCLIENTJOBID0000000000',
    provider_id: PROVIDER,
    model_id: model().id,
    task,
    params: validated.values,
    device: 'cuda:0',
  }
}

describe('upcastV1Capabilities', () => {
  it('reports contract v2 and carries the provider id', () => {
    const v2 = upcasted()

    expect(v2.contract_version).toBe(2)
    expect(v2.provider_id).toBe(PROVIDER)
  })

  it('copies devices across unchanged', () => {
    expect(upcasted().devices).toEqual([
      { id: 'cuda:0', label: 'RTX 3090', backend: 'cuda' },
    ])
  })

  it('provider-qualifies the model id and keeps the v1 id as local_id', () => {
    expect(model().id).toBe('atomic-media-worker:registry-video')
    expect(model().local_id).toBe('registry-video')
    expect(model().provider_id).toBe(PROVIDER)
    expect(model().label).toBe('Registry Video')
  })

  it('maps kinds to tasks', () => {
    expect(model().tasks).toEqual(['text_to_video', 'image_to_video'])
  })

  it('declares v1 feature reality: no cancel, no events, no install', () => {
    expect(upcasted().features).toEqual({
      cancel: false,
      progress: true,
      queue: true,
      events: false,
      install: false,
      batch: false,
    })
  })

  it('maps installed to an install state that is not installable', () => {
    expect(model().install).toEqual({ installed: true, installable: false })
  })

  it('carries fitness across 1:1', () => {
    expect(model().fitness).toEqual({
      status: 'recommended',
      required_device: 'cuda:0',
    })
  })

  it('renames recommended[].kind to task and qualifies its model id', () => {
    expect(upcasted().recommended).toEqual([
      { task: 'text_to_video', model_id: 'atomic-media-worker:registry-video' },
    ])
  })

  describe('the parameter set matches the controls the v1 form renders', () => {
    it('exposes exactly the text_to_video controls', () => {
      expect(paramIds('text_to_video')).toEqual([
        'prompt',
        'negative_prompt',
        'resolution',
        'steps',
        'guidance_scale',
        'num_frames',
        'fps',
        'seed',
      ])
    })

    it('adds input_image for image_to_video only', () => {
      expect(paramIds('image_to_video')).toContain('input_image')
      expect(paramIds('text_to_video')).not.toContain('input_image')
    })

    it('declares no params for a task the model does not claim', () => {
      expect(model().params.text_to_image).toBeUndefined()
    })
  })

  describe('constraint mapping', () => {
    it('turns resolutions into one resolution param carrying width/height', () => {
      expect(spec('text_to_video', 'resolution')).toEqual({
        id: 'resolution',
        type: 'resolution',
        group: 'output',
        label: 'Resolution',
        default: '832x480',
        options: [
          { value: '832x480', label: '832 × 480', width: 832, height: 480 },
          { value: '1280x704', label: '1280 × 704', width: 1280, height: 704 },
        ],
      })
    })

    it('turns frame_rule into an int param with min, max and modulus', () => {
      expect(spec('text_to_video', 'num_frames')).toEqual({
        id: 'num_frames',
        type: 'int',
        group: 'motion',
        label: 'Frames',
        min: 17,
        max: 121,
        modulus: { modulus: 4, offset: 1 },
        default: 17,
      })
    })

    it('turns ranges.fps into a bounded int with its default', () => {
      expect(spec('text_to_video', 'fps')).toEqual({
        id: 'fps',
        type: 'int',
        group: 'motion',
        label: 'FPS',
        min: 8,
        max: 30,
        default: 12,
      })
    })

    it('turns ranges.steps into a bounded int with its default', () => {
      expect(spec('text_to_video', 'steps')).toEqual({
        id: 'steps',
        type: 'int',
        group: 'sampling',
        label: 'Steps',
        min: 1,
        max: 60,
        default: 10,
      })
    })

    it('turns ranges.guidance_scale into a float stepping by 0.1', () => {
      expect(spec('text_to_video', 'guidance_scale')).toEqual({
        id: 'guidance_scale',
        type: 'float',
        group: 'sampling',
        label: 'Guidance',
        min: 0,
        max: 15,
        step: 0.1,
        default: 5,
      })
    })

    it('always adds a required prompt, because v1 made it mandatory', () => {
      expect(spec('text_to_video', 'prompt')).toEqual({
        id: 'prompt',
        type: 'text',
        group: 'core',
        label: 'Prompt',
        required: true,
      })
    })

    it('maps supports.negative_prompt to an optional text param', () => {
      expect(spec('text_to_video', 'negative_prompt')).toEqual({
        id: 'negative_prompt',
        type: 'text',
        group: 'core',
        label: 'Negative prompt',
      })
    })

    it('maps supports.seed to a seed param behind Advanced', () => {
      expect(spec('text_to_video', 'seed')).toEqual({
        id: 'seed',
        type: 'seed',
        group: 'advanced',
        label: 'Seed',
        advanced: true,
      })
    })

    it('maps supports.input_image to a required image_ref on image_to_video', () => {
      expect(spec('image_to_video', 'input_image')).toEqual({
        id: 'input_image',
        type: 'image_ref',
        group: 'core',
        label: 'Reference image path',
        required: true,
      })
    })
  })

  describe('video-only params attach only to video tasks', () => {
    it('omits num_frames and fps from an image task', () => {
      const imageOnly: AtomicMediaCapabilities = {
        contract_version: 1,
        models: [
          {
            id: 'still',
            label: 'Still',
            kinds: ['text_to_image'],
            frame_rule: { modulus: 4, offset: 1, min: 17, max: 121 },
            ranges: { fps: { min: 8, max: 30 }, steps: { min: 1, max: 50 } },
          },
        ],
      }
      const ids = (
        upcastV1Capabilities(imageOnly, PROVIDER).models[0]?.params
          .text_to_image ?? []
      ).map((entry) => entry.id)

      expect(ids).not.toContain('num_frames')
      expect(ids).not.toContain('fps')
      expect(ids).toContain('steps')
    })

    it('marks video tasks as producing video and image tasks as producing image', () => {
      expect(model().outputs?.text_to_video?.media_type).toBe('video')

      const still: AtomicMediaCapabilities = {
        contract_version: 1,
        models: [{ id: 's', label: 'S', kinds: ['text_to_image'] }],
      }
      expect(
        upcastV1Capabilities(still, PROVIDER).models[0]?.outputs
          ?.text_to_image?.media_type
      ).toBe('image')
    })
  })

  describe('totality', () => {
    it('ignores unknown v1 fields instead of throwing', () => {
      const odd = {
        contract_version: 1,
        surprise: 'ignored',
        models: [
          { id: 'm', label: 'M', kinds: ['text_to_video'], mystery: true },
        ],
      } as unknown as AtomicMediaCapabilities

      expect(() => upcastV1Capabilities(odd, PROVIDER)).not.toThrow()
      expect(upcastV1Capabilities(odd, PROVIDER).models).toHaveLength(1)
    })

    it('survives an empty payload', () => {
      const empty = upcastV1Capabilities(
        {} as AtomicMediaCapabilities,
        PROVIDER
      )

      expect(empty.contract_version).toBe(2)
      expect(empty.models).toEqual([])
      expect(empty.devices).toEqual([])
    })

    it('skips a model with no usable kinds rather than emitting a broken one', () => {
      const noKinds = {
        contract_version: 1,
        models: [{ id: 'm', label: 'M' }],
      } as unknown as AtomicMediaCapabilities

      expect(upcastV1Capabilities(noKinds, PROVIDER).models).toEqual([])
    })
  })
})

describe('downcastV2Request', () => {
  it('reproduces the v1 body the form submits at its defaults, byte for byte', () => {
    const request = requestAt('text_to_video', {
      prompt: 'a cat in a hat',
      resolution: '832x480',
      num_frames: 17,
      fps: 12,
      steps: 10,
      guidance_scale: 5,
    })

    const body = downcastV2Request(request, model())

    expect(body).toEqual(FORM_DEFAULT_BODY)
    expect(JSON.stringify(body)).toBe(JSON.stringify(FORM_DEFAULT_BODY))
  })

  it('splits the resolution option back into width and height', () => {
    const body = downcastV2Request(
      requestAt('text_to_video', {
        prompt: 'p',
        resolution: '1280x704',
      }),
      model()
    )

    expect(body.width).toBe(1280)
    expect(body.height).toBe(704)
  })

  it('places negative_prompt and seed exactly where v1 put them', () => {
    const body = downcastV2Request(
      requestAt('text_to_video', {
        prompt: 'a cat in a hat',
        resolution: '832x480',
        num_frames: 17,
        fps: 12,
        steps: 10,
        guidance_scale: 5,
        negative_prompt: 'blurry',
        seed: '42',
      }),
      model()
    )

    expect(JSON.stringify(body)).toBe(
      JSON.stringify({
        kind: 'text_to_video',
        prompt: 'a cat in a hat',
        device: 'cuda:0',
        model_id: 'registry-video',
        width: 832,
        height: 480,
        steps: 10,
        guidance_scale: 5,
        negative_prompt: 'blurry',
        seed: 42,
        num_frames: 17,
        fps: 12,
      })
    )
  })

  it('appends input_image last, as the v1 form did', () => {
    const body = downcastV2Request(
      requestAt('image_to_video', {
        prompt: 'a cat in a hat',
        resolution: '832x480',
        num_frames: 17,
        fps: 12,
        steps: 10,
        guidance_scale: 5,
        input_image: 'D:\\Images\\reference.png',
      }),
      model()
    )

    expect(JSON.stringify(body)).toBe(
      JSON.stringify({
        kind: 'image_to_video',
        prompt: 'a cat in a hat',
        device: 'cuda:0',
        model_id: 'registry-video',
        width: 832,
        height: 480,
        steps: 10,
        guidance_scale: 5,
        num_frames: 17,
        fps: 12,
        input_image: 'D:\\Images\\reference.png',
      })
    )
  })

  it('omits an empty seed so the worker randomises, matching v1', () => {
    const body = downcastV2Request(
      requestAt('text_to_video', { prompt: 'p', resolution: '832x480', seed: '' }),
      model()
    )

    expect(body).not.toHaveProperty('seed')
  })

  it('omits device when none was chosen', () => {
    const body = downcastV2Request(
      {
        client_job_id: '01J',
        provider_id: PROVIDER,
        model_id: model().id,
        task: 'text_to_video',
        params: { prompt: 'p', resolution: '832x480' },
      },
      model()
    )

    expect(body).not.toHaveProperty('device')
  })

  it('sends the unqualified v1 model id, not the provider-qualified one', () => {
    const body = downcastV2Request(
      requestAt('text_to_video', { prompt: 'p', resolution: '832x480' }),
      model()
    )

    expect(body.model_id).toBe('registry-video')
  })

  it('drops params a v1 worker cannot accept, warning once and naming them', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const body = downcastV2Request(
      {
        client_job_id: '01J',
        provider_id: PROVIDER,
        model_id: model().id,
        task: 'text_to_video',
        params: {
          prompt: 'p',
          resolution: '832x480',
          sampler: 'euler',
          lora_scale: 0.8,
        },
      },
      model()
    )

    expect(body).not.toHaveProperty('sampler')
    expect(body).not.toHaveProperty('lora_scale')
    expect(warn).toHaveBeenCalledTimes(1)
    const message = String(warn.mock.calls[0]?.[0])
    expect(message).toContain(PROVIDER)
    expect(message).toContain('sampler')
    expect(message).toContain('lora_scale')

    warn.mockRestore()
  })

  it('does not warn when every param is understood', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const body = downcastV2Request(
      requestAt('text_to_video', { prompt: 'p', resolution: '832x480' }),
      model()
    )

    expect(body.prompt).toBe('p')
    expect(body.width).toBe(832)
    expect(warn.mock.calls).toEqual([])
    warn.mockRestore()
  })
})
