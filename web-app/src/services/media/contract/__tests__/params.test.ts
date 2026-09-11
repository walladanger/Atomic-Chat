import { describe, expect, it } from 'vitest'

import { validateParams, type MediaParamSpec } from '../params'

const seedSpec: MediaParamSpec = { id: 'seed', type: 'seed' }

const framesSpec: MediaParamSpec = {
  id: 'num_frames',
  type: 'int',
  min: 17,
  max: 81,
  modulus: { modulus: 4, offset: 1 },
}

const resolutionSpec: MediaParamSpec = {
  id: 'resolution',
  type: 'resolution',
  options: [
    { value: '832x480', width: 832, height: 480 },
    { value: '480x832', width: 480, height: 832 },
  ],
}

describe('validateParams', () => {
  it('returns an ok result with no errors when every value is valid', () => {
    const result = validateParams(
      [{ id: 'prompt', type: 'text', required: true }],
      { prompt: 'a cat' }
    )

    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.values).toEqual({ prompt: 'a cat' })
  })

  describe('numeric bounds', () => {
    it('clamps a value below min up to min', () => {
      const result = validateParams(
        [{ id: 'steps', type: 'int', min: 4, max: 50 }],
        { steps: 1 }
      )

      expect(result.ok).toBe(true)
      expect(result.values.steps).toBe(4)
    })

    it('clamps a value above max down to max', () => {
      const result = validateParams(
        [{ id: 'steps', type: 'int', min: 4, max: 50 }],
        { steps: 999 }
      )

      expect(result.values.steps).toBe(50)
    })

    it('clamps floats without rounding them to integers', () => {
      const result = validateParams(
        [{ id: 'guidance_scale', type: 'float', min: 1, max: 12 }],
        { guidance_scale: 7.5 }
      )

      expect(result.values.guidance_scale).toBe(7.5)
    })

    it('rounds an int to the nearest integer', () => {
      const result = validateParams([{ id: 'steps', type: 'int' }], {
        steps: 7.6,
      })

      expect(result.values.steps).toBe(8)
    })

    it('coerces a numeric string', () => {
      const result = validateParams([{ id: 'steps', type: 'int' }], {
        steps: '12',
      })

      expect(result.values.steps).toBe(12)
    })

    it('reports a non-numeric value instead of silently defaulting it', () => {
      const result = validateParams([{ id: 'steps', type: 'int' }], {
        steps: 'twelve',
      })

      expect(result.ok).toBe(false)
      expect(result.errors).toEqual([
        { param: 'steps', code: 'invalid_type', message: expect.any(String) },
      ])
      expect(result.values).not.toHaveProperty('steps')
    })
  })

  describe('modulus quantisation', () => {
    it('leaves a value that already satisfies the modulus unchanged', () => {
      expect(
        validateParams([framesSpec], { num_frames: 17 }).values.num_frames
      ).toBe(17)
      expect(
        validateParams([framesSpec], { num_frames: 21 }).values.num_frames
      ).toBe(21)
    })

    it('snaps down to the nearer satisfying value', () => {
      expect(
        validateParams([framesSpec], { num_frames: 18 }).values.num_frames
      ).toBe(17)
    })

    it('snaps up to the nearer satisfying value', () => {
      expect(
        validateParams([framesSpec], { num_frames: 20 }).values.num_frames
      ).toBe(21)
    })

    it('breaks a tie downwards, matching the v1 nearestFrame behaviour', () => {
      expect(
        validateParams([framesSpec], { num_frames: 19 }).values.num_frames
      ).toBe(17)
    })

    it('keeps the quantised value inside min/max', () => {
      expect(
        validateParams([framesSpec], { num_frames: 1 }).values.num_frames
      ).toBe(17)
      expect(
        validateParams([framesSpec], { num_frames: 1000 }).values.num_frames
      ).toBe(81)
    })
  })

  describe('enum membership', () => {
    const samplerSpec: MediaParamSpec = {
      id: 'sampler',
      type: 'enum',
      options: [{ value: 'euler' }, { value: 'dpmpp_2m' }],
    }

    it('accepts a member', () => {
      const result = validateParams([samplerSpec], { sampler: 'dpmpp_2m' })

      expect(result.ok).toBe(true)
      expect(result.values.sampler).toBe('dpmpp_2m')
    })

    it('rejects a non-member rather than coercing it', () => {
      const result = validateParams([samplerSpec], { sampler: 'ancestral' })

      expect(result.ok).toBe(false)
      expect(result.errors).toEqual([
        {
          param: 'sampler',
          code: 'not_an_option',
          message: expect.any(String),
        },
      ])
      expect(result.values).not.toHaveProperty('sampler')
    })

    it('matches a numeric option supplied as a string and emits the option type', () => {
      const result = validateParams(
        [{ id: 'fps', type: 'enum', options: [{ value: 12 }, { value: 24 }] }],
        { fps: '24' }
      )

      expect(result.ok).toBe(true)
      expect(result.values.fps).toBe(24)
    })

    it('treats a resolution as membership over its options', () => {
      expect(
        validateParams([resolutionSpec], { resolution: '480x832' }).values
          .resolution
      ).toBe('480x832')

      const rejected = validateParams([resolutionSpec], { resolution: '1x1' })
      expect(rejected.ok).toBe(false)
      expect(rejected.errors[0]?.code).toBe('not_an_option')
    })
  })

  describe('required and defaults', () => {
    it('reports a required param with neither a value nor a default', () => {
      const result = validateParams(
        [{ id: 'prompt', type: 'text', required: true }],
        {}
      )

      expect(result.ok).toBe(false)
      expect(result.errors).toEqual([
        { param: 'prompt', code: 'required', message: expect.any(String) },
      ])
    })

    it('treats a blank string as absent for a required param', () => {
      const result = validateParams(
        [{ id: 'prompt', type: 'text', required: true }],
        { prompt: '   ' }
      )

      expect(result.ok).toBe(false)
      expect(result.errors[0]?.code).toBe('required')
    })

    it('satisfies a required param from its default', () => {
      const result = validateParams(
        [{ id: 'fps', type: 'int', required: true, default: 12 }],
        {}
      )

      expect(result.ok).toBe(true)
      expect(result.values.fps).toBe(12)
    })

    it('omits an optional param with no value and no default', () => {
      const result = validateParams([{ id: 'fps', type: 'int' }], {})

      expect(result.ok).toBe(true)
      expect(result.values).not.toHaveProperty('fps')
    })

    it('applies the default when the key is present but undefined', () => {
      const result = validateParams(
        [{ id: 'fps', type: 'int', default: 12 }],
        { fps: undefined }
      )

      expect(result.values.fps).toBe(12)
    })

    it('does not repopulate a field the user deliberately cleared', () => {
      const result = validateParams(
        [{ id: 'negative_prompt', type: 'text', default: 'blurry' }],
        { negative_prompt: '' }
      )

      expect(result.ok).toBe(true)
      expect(result.values).not.toHaveProperty('negative_prompt')
    })

    it('validates the default itself rather than trusting it', () => {
      const result = validateParams(
        [{ id: 'steps', type: 'int', min: 4, max: 50, default: 999 }],
        {}
      )

      expect(result.values.steps).toBe(50)
    })
  })

  describe('depends_on', () => {
    const specs: MediaParamSpec[] = [
      {
        id: 'mode',
        type: 'enum',
        options: [{ value: 'text' }, { value: 'image' }],
      },
      {
        id: 'strength',
        type: 'float',
        min: 0,
        max: 1,
        default: 0.6,
        depends_on: [{ param: 'mode', equals: 'image' }],
      },
    ]

    it('includes a dependent param when the clause holds', () => {
      const result = validateParams(specs, { mode: 'image', strength: 0.4 })

      expect(result.ok).toBe(true)
      expect(result.values).toEqual({ mode: 'image', strength: 0.4 })
    })

    it('excludes a hidden param from the output even when a value was supplied', () => {
      const result = validateParams(specs, { mode: 'text', strength: 0.4 })

      expect(result.ok).toBe(true)
      expect(result.values).toEqual({ mode: 'text' })
      expect(result.values).not.toHaveProperty('strength')
    })

    it('does not report a hidden required param as missing', () => {
      const result = validateParams(
        [
          {
            id: 'mode',
            type: 'enum',
            options: [{ value: 'text' }, { value: 'image' }],
          },
          {
            id: 'input_image',
            type: 'image_ref',
            required: true,
            depends_on: [{ param: 'mode', equals: 'image' }],
          },
        ],
        { mode: 'text' }
      )

      expect(result.ok).toBe(true)
      expect(result.errors).toEqual([])
    })

    it('supports an in clause', () => {
      const withIn: MediaParamSpec[] = [
        { id: 'task', type: 'string' },
        {
          id: 'fps',
          type: 'int',
          default: 12,
          depends_on: [
            { param: 'task', in: ['text_to_video', 'image_to_video'] },
          ],
        },
      ]

      expect(validateParams(withIn, { task: 'image_to_video' }).values.fps).toBe(
        12
      )
      expect(
        validateParams(withIn, { task: 'text_to_image' }).values
      ).not.toHaveProperty('fps')
    })

    it('supports a truthy clause', () => {
      const withTruthy: MediaParamSpec[] = [
        { id: 'upscale', type: 'bool' },
        {
          id: 'upscale_factor',
          type: 'int',
          default: 2,
          depends_on: [{ param: 'upscale', truthy: true }],
        },
      ]

      expect(
        validateParams(withTruthy, { upscale: true }).values.upscale_factor
      ).toBe(2)
      expect(
        validateParams(withTruthy, { upscale: false }).values
      ).not.toHaveProperty('upscale_factor')
    })

    it('requires every clause to hold', () => {
      const specsAnd: MediaParamSpec[] = [
        { id: 'mode', type: 'string' },
        { id: 'upscale', type: 'bool' },
        {
          id: 'upscale_factor',
          type: 'int',
          default: 2,
          depends_on: [
            { param: 'mode', equals: 'image' },
            { param: 'upscale', truthy: true },
          ],
        },
      ]

      expect(
        validateParams(specsAnd, { mode: 'image', upscale: true }).values
          .upscale_factor
      ).toBe(2)
      expect(
        validateParams(specsAnd, { mode: 'text', upscale: true }).values
      ).not.toHaveProperty('upscale_factor')
    })

    it('hides a param whose dependency is itself hidden', () => {
      const chained: MediaParamSpec[] = [
        { id: 'mode', type: 'string' },
        {
          id: 'upscale',
          type: 'bool',
          default: true,
          depends_on: [{ param: 'mode', equals: 'image' }],
        },
        {
          id: 'upscale_factor',
          type: 'int',
          default: 2,
          depends_on: [{ param: 'upscale', truthy: true }],
        },
      ]

      const result = validateParams(chained, { mode: 'text' })

      expect(result.values).not.toHaveProperty('upscale')
      expect(result.values).not.toHaveProperty('upscale_factor')
    })
  })

  describe('unknown keys', () => {
    it('drops a value with no matching spec instead of forwarding it', () => {
      const result = validateParams([{ id: 'prompt', type: 'text' }], {
        prompt: 'a cat',
        legacy_preset: 'wan-fast',
      })

      expect(result.ok).toBe(true)
      expect(result.errors).toEqual([])
      expect(result.values).toEqual({ prompt: 'a cat' })
    })
  })

  describe('seed', () => {
    it('omits an empty seed so the provider randomises rather than using 0', () => {
      const result = validateParams([seedSpec], { seed: '' })

      expect(result.ok).toBe(true)
      expect(result.errors).toEqual([])
      expect(result.values).not.toHaveProperty('seed')
    })

    it('omits an absent seed', () => {
      expect(validateParams([seedSpec], {}).values).not.toHaveProperty('seed')
    })

    it('keeps an explicit zero seed', () => {
      expect(validateParams([seedSpec], { seed: 0 }).values.seed).toBe(0)
    })

    it('coerces a numeric seed string', () => {
      expect(validateParams([seedSpec], { seed: '42' }).values.seed).toBe(42)
    })

    it('treats an empty required seed as satisfied, because random is a value', () => {
      const result = validateParams(
        [{ id: 'seed', type: 'seed', required: true }],
        { seed: '' }
      )

      expect(result.ok).toBe(true)
      expect(result.errors).toEqual([])
    })
  })

  describe('other types', () => {
    it('coerces booleans from their string and numeric spellings', () => {
      const spec: MediaParamSpec[] = [{ id: 'tiled', type: 'bool' }]

      expect(validateParams(spec, { tiled: 'true' }).values.tiled).toBe(true)
      expect(validateParams(spec, { tiled: 'false' }).values.tiled).toBe(false)
      expect(validateParams(spec, { tiled: 1 }).values.tiled).toBe(true)
      expect(validateParams(spec, { tiled: 0 }).values.tiled).toBe(false)
    })

    it('reports a boolean it cannot interpret', () => {
      const result = validateParams([{ id: 'tiled', type: 'bool' }], {
        tiled: 'maybe',
      })

      expect(result.ok).toBe(false)
      expect(result.errors[0]?.code).toBe('invalid_type')
    })

    it('reports a string longer than max_length', () => {
      const result = validateParams(
        [{ id: 'prompt', type: 'text', max_length: 4 }],
        { prompt: 'much too long' }
      )

      expect(result.ok).toBe(false)
      expect(result.errors[0]).toEqual({
        param: 'prompt',
        code: 'max_length',
        message: expect.any(String),
      })
    })

    it('normalises a stringlist and drops non-string members', () => {
      const result = validateParams([{ id: 'loras', type: 'stringlist' }], {
        loras: ['a', 2, null, 'b'],
      })

      expect(result.values.loras).toEqual(['a', 'b'])
    })

    it('lifts a bare string into a stringlist', () => {
      expect(
        validateParams([{ id: 'loras', type: 'stringlist' }], { loras: 'a' })
          .values.loras
      ).toEqual(['a'])
    })

    it('passes an image_ref through as a string', () => {
      const result = validateParams(
        [{ id: 'input_image', type: 'image_ref' }],
        { input_image: 'C:/tmp/cat.png' }
      )

      expect(result.values.input_image).toBe('C:/tmp/cat.png')
    })
  })

  describe('totality', () => {
    it('never throws on malformed input', () => {
      expect(() =>
        validateParams(
          [
            { id: 'a', type: 'enum' },
            { id: 'b', type: 'int' },
          ],
          { a: {}, b: [], c: undefined }
        )
      ).not.toThrow()
    })

    it('collects every error rather than stopping at the first', () => {
      const result = validateParams(
        [
          { id: 'prompt', type: 'text', required: true },
          { id: 'sampler', type: 'enum', options: [{ value: 'euler' }] },
        ],
        { sampler: 'nope' }
      )

      expect(result.ok).toBe(false)
      expect(result.errors.map((error) => error.param).sort()).toEqual([
        'prompt',
        'sampler',
      ])
    })

    it('does not mutate the input values', () => {
      const input = { num_frames: 18 }
      validateParams([framesSpec], input)

      expect(input).toEqual({ num_frames: 18 })
    })
  })
})
