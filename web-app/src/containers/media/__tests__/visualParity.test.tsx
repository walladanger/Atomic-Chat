/**
 * Task 11 Step 1 - the visual-parity guard for the Media Studio refit.
 *
 * Task 2 already pinned the SUBMITTED PAYLOAD (services/media/contract/
 * __tests__/parity.test.tsx). This file pins the other half: the RENDERED
 * SURFACE - which controls exist, in what order, with which labels, defaults
 * and bounds. Task 11 deletes MODES and all eight bespoke control blocks from
 * MediaGenerationForm and drives the same surface from MediaParamGroups, so
 * the two tests together are what make "refit" provable rather than asserted.
 *
 * It is written as a CHARACTERISATION test against the component's public
 * surface, never its internals, so it is green before the refit and must stay
 * green after it. See decision D9 on the tracker: plan Step 1 calls this a
 * "failing" test, but a parity test that fails today would be pinning
 * something other than today's behaviour. The genuinely-red tests for the new
 * behaviour are Step 2's.
 *
 * Every expected value below is the fixture's own, so this cannot drift from
 * the payload the worker actually reported.
 */
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { MediaGenerationForm } from '../MediaGenerationForm'
import type {
  AtomicMediaCapabilities,
  AtomicMediaModel,
} from '@/services/atomicMedia/types'
import fixture from '@/services/media/contract/__tests__/fixtures/worker-v1-capabilities.json'

const v1 = fixture.payload as AtomicMediaCapabilities
const model = v1.models?.[0] as AtomicMediaModel

function renderForm(capabilities: AtomicMediaCapabilities | null = v1) {
  const onSubmit = vi.fn()
  const result = render(
    <MediaGenerationForm capabilities={capabilities} onSubmit={onSubmit} />
  )
  return { ...result, onSubmit }
}

/** The ids of every rendered control, in DOM order. */
function controlOrder(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[id^="media-"]')).map(
    (node) => node.id
  )
}

/**
 * The text a person actually READS beside each control, keyed by control id.
 *
 * Deliberately not getByLabelText: that matches an aria-label too, so it stays
 * green when the visible caption is renamed and the aria-label is left alone.
 * A mutation renaming the Guidance caption to "CFG" proved exactly that, and
 * this helper is what closed the gap.
 */
function visibleLabels(container: HTMLElement): Record<string, string> {
  const labels: Record<string, string> = {}
  for (const node of Array.from(container.querySelectorAll('label[for]'))) {
    labels[node.getAttribute('for') as string] = node.textContent?.trim() ?? ''
  }
  return labels
}

describe('Media Studio visual parity', () => {
  describe('the control surface', () => {
    it('renders exactly these controls, in this order, for text to video', () => {
      const { container } = renderForm()

      expect(controlOrder(container)).toEqual([
        'media-model',
        'media-resolution',
        'media-device',
        'media-frames',
        'media-fps',
        'media-steps',
        'media-guidance',
        'media-seed',
        'media-negative',
        'media-prompt',
      ])
    })

    it('reveals the reference image control only in image to video', () => {
      const { container } = renderForm()
      expect(controlOrder(container)).not.toContain('media-input-image')

      fireEvent.click(screen.getByRole('button', { name: 'Image → Video' }))

      expect(controlOrder(container)).toEqual([
        'media-model',
        'media-resolution',
        'media-device',
        'media-frames',
        'media-fps',
        'media-steps',
        'media-guidance',
        'media-seed',
        'media-input-image',
        'media-negative',
        'media-prompt',
      ])
    })

    it('labels each control exactly as it is labelled today', () => {
      renderForm()

      expect(screen.getByLabelText('Model')).toHaveAttribute('id', 'media-model')
      expect(screen.getByLabelText('Resolution')).toHaveAttribute(
        'id',
        'media-resolution'
      )
      expect(screen.getByLabelText('Device')).toHaveAttribute('id', 'media-device')
      expect(screen.getByLabelText('Frames')).toHaveAttribute('id', 'media-frames')
      expect(screen.getByLabelText('FPS')).toHaveAttribute('id', 'media-fps')
      expect(screen.getByLabelText('Steps')).toHaveAttribute('id', 'media-steps')
      expect(screen.getByLabelText('Guidance')).toHaveAttribute(
        'id',
        'media-guidance'
      )
      expect(screen.getByLabelText('Seed')).toHaveAttribute('id', 'media-seed')
      expect(screen.getByLabelText('Negative prompt')).toHaveAttribute(
        'id',
        'media-negative'
      )
      expect(screen.getByLabelText('Prompt')).toHaveAttribute('id', 'media-prompt')
    })

    it('captions each control with the words shown today', () => {
      const { container } = renderForm()

      expect(visibleLabels(container)).toEqual({
        'media-model': 'Model',
        'media-resolution': 'Resolution',
        'media-device': 'Device',
        'media-frames': 'Frames',
        'media-fps': 'FPS',
        'media-steps': 'Steps',
        'media-guidance': 'Guidance',
        'media-seed': 'Seed',
        'media-negative': 'Negative prompt',
        'media-prompt': 'Prompt',
      })
    })

    it('captions the reference image control shown only in image to video', () => {
      const { container } = renderForm()

      fireEvent.click(screen.getByRole('button', { name: 'Image → Video' }))

      expect(visibleLabels(container)['media-input-image']).toBe(
        'Reference image path'
      )
    })

    it('offers the three modes in their current order', () => {
      renderForm()

      const tabs = screen
        .getAllByRole('button')
        .map((node) => node.textContent?.trim())
        .filter((label) => label !== 'Generate')

      expect(tabs).toEqual(['Text → Video', 'Image → Video', 'Image'])
    })
  })

  describe('defaults, taken from the model the worker reported', () => {
    it('applies the model defaults on first render', () => {
      renderForm()
      const defaults = model.defaults ?? {}

      expect(screen.getByLabelText('Resolution')).toHaveValue(
        `${defaults.width}x${defaults.height}`
      )
      expect(screen.getByLabelText('Frames')).toHaveValue(defaults.num_frames)
      expect(screen.getByLabelText('FPS')).toHaveValue(defaults.fps)
      expect(screen.getByLabelText('Steps')).toHaveValue(defaults.steps)
      expect(screen.getByLabelText('Guidance')).toHaveValue(
        defaults.guidance_scale
      )
    })

    it('selects the recommended model and its required device', () => {
      renderForm()

      expect(screen.getByLabelText('Model')).toHaveValue(
        v1.recommended?.[0]?.model_id
      )
      expect(screen.getByLabelText('Device')).toHaveValue(
        model.fitness?.required_device
      )
    })

    it('leaves the seed blank so the provider picks one', () => {
      renderForm()

      expect(screen.getByLabelText('Seed')).toHaveValue(null)
      expect(screen.getByLabelText('Seed')).toHaveAttribute(
        'placeholder',
        'Random'
      )
    })

    it('lists every resolution the model declares', () => {
      renderForm()

      const options = within(screen.getByLabelText('Resolution'))
        .getAllByRole('option')
        .map((node) => node.textContent)

      expect(options).toEqual(
        (model.resolutions ?? []).map((item) => `${item.width} × ${item.height}`)
      )
    })
  })

  describe('bounds, taken from the ranges the worker reported', () => {
    it('bounds Frames by the frame rule', () => {
      renderForm()
      const frames = screen.getByLabelText('Frames')

      expect(frames).toHaveAttribute('min', String(model.frame_rule?.min))
      expect(frames).toHaveAttribute('max', String(model.frame_rule?.max))
    })

    it('states the frame rule in words beside the control', () => {
      renderForm()

      expect(
        screen.getByText(
          `Must be ${model.frame_rule?.modulus}n + ${model.frame_rule?.offset}.`
        )
      ).toBeInTheDocument()
    })

    it('bounds FPS, Steps and Guidance by their declared ranges', () => {
      renderForm()
      const ranges = model.ranges ?? {}

      expect(screen.getByLabelText('FPS')).toHaveAttribute(
        'min',
        String(ranges.fps?.min)
      )
      expect(screen.getByLabelText('FPS')).toHaveAttribute(
        'max',
        String(ranges.fps?.max)
      )
      expect(screen.getByLabelText('Steps')).toHaveAttribute(
        'min',
        String(ranges.steps?.min)
      )
      expect(screen.getByLabelText('Steps')).toHaveAttribute(
        'max',
        String(ranges.steps?.max)
      )
      expect(screen.getByLabelText('Guidance')).toHaveAttribute(
        'min',
        String(ranges.guidance_scale?.min)
      )
      expect(screen.getByLabelText('Guidance')).toHaveAttribute(
        'max',
        String(ranges.guidance_scale?.max)
      )
    })

    it('steps Guidance by 0.1 so it can hold a fractional value', () => {
      renderForm()

      expect(screen.getByLabelText('Guidance')).toHaveAttribute('step', '0.1')
    })

    it('quantises Frames on blur, breaking ties downwards', () => {
      renderForm()
      const frames = screen.getByLabelText('Frames')

      // 19 sits exactly between 17 and 21 on a 4n+1 rule.
      fireEvent.change(frames, { target: { value: '19' } })
      expect(frames).toHaveValue(19)

      fireEvent.blur(frames)
      expect(frames).toHaveValue(17)
    })
  })

  describe('states other than the happy path', () => {
    it('gates Generate on a non-empty prompt', () => {
      renderForm()
      const generate = screen.getByRole('button', { name: 'Generate' })

      expect(generate).toBeDisabled()

      fireEvent.change(screen.getByLabelText('Prompt'), {
        target: { value: 'a cat in a hat' },
      })

      expect(generate).toBeEnabled()
    })

    it('explains an empty mode instead of rendering an unusable form', () => {
      const { container } = renderForm()

      fireEvent.click(screen.getByRole('button', { name: 'Image' }))

      expect(
        screen.getByText('No models available for this mode')
      ).toBeInTheDocument()
      expect(controlOrder(container)).toEqual(['media-prompt'])
    })

    it('explains an unsupported contract version instead of rendering', () => {
      const { container } = renderForm({
        ...v1,
        contract_version: 2,
      } as unknown as AtomicMediaCapabilities)

      expect(
        screen.getByText('Media model capabilities unavailable')
      ).toBeInTheDocument()
      expect(controlOrder(container)).toEqual([])
    })

    it('explains absent capabilities instead of rendering', () => {
      const { container } = renderForm(null)

      expect(
        screen.getByText('Media model capabilities unavailable')
      ).toBeInTheDocument()
      expect(controlOrder(container)).toEqual([])
    })
  })
})
