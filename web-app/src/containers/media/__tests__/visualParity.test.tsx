/**
 * The visual-parity guard for the Media Studio.
 *
 * Task 2's parity.test.tsx pins the submitted PAYLOAD byte-for-byte. This file
 * pins the RENDERED SURFACE: which controls exist, in what order, with which
 * captions, defaults and bounds.
 *
 * IMPORTANT - what "parity" means here, and why it changed. It was written
 * against the v1 form and pinned that form's exact DOM order. Task 11 drives
 * the form from the Task 10 schema renderer, which lays out by GROUP, so the
 * order necessarily changes; the two cannot both hold. Decision D10 records
 * the contradiction, the measured before/after, and the user's answer: keep the
 * prompt composer at the bottom beside Generate, accept the grouped order
 * elsewhere, and redefine the gate as SAME CONTROLS, CAPTIONS, DEFAULTS,
 * BOUNDS AND PAYLOAD rather than same DOM order.
 *
 * So the order below is the AGREED order, deliberately updated once and
 * recorded - not a test quietly relaxed to match whatever the code now does.
 * Everything else in this file still pins v1's behaviour exactly, and did not
 * change across the refit.
 *
 * Every expected value is read from the fixture, so it cannot drift from the
 * payload the worker actually reported.
 */
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { MediaGenerationForm } from '../MediaGenerationForm'
import type { AtomicMediaCapabilities } from '@/services/atomicMedia/types'
import { upcastV1Capabilities } from '@/services/media/contract'
import type {
  MediaModelDescriptor,
  MediaProviderDescriptor,
} from '@/services/media/contract'
import fixture from '@/services/media/contract/__tests__/fixtures/worker-v1-capabilities.json'

const v1 = fixture.payload as AtomicMediaCapabilities
const PROVIDER = 'atomic-media-worker'
const capabilities = upcastV1Capabilities(v1, PROVIDER)
const model = capabilities.models[0] as MediaModelDescriptor
const v1Model = v1.models?.[0]

const descriptor: MediaProviderDescriptor = {
  id: PROVIDER,
  label: 'Atomic Media Worker',
  kind: 'local_worker',
  adapter: 'atomic-media-worker',
  enabled: true,
  origin: 'builtin',
}

function renderForm(
  overrides: { task?: string; models?: MediaModelDescriptor[] } = {}
) {
  const onSubmit = vi.fn()
  const models = overrides.models ?? [model]
  const result = render(
    <MediaGenerationForm
      tasks={capabilities.tasks ?? []}
      task={overrides.task ?? 'text_to_video'}
      onTaskChange={vi.fn()}
      models={models}
      providers={[descriptor]}
      devices={capabilities.devices}
      selectedModelId={models[0]?.id ?? null}
      onSelectModel={vi.fn()}
      onSubmit={onSubmit}
    />
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

function showAdvanced() {
  fireEvent.click(screen.getByRole('button', { name: 'Show advanced' }))
}

describe('Media Studio visual parity', () => {
  describe('the control surface', () => {
    it('renders exactly these controls, in this order, for text to video', () => {
      const { container } = renderForm()

      // Structural selectors first, then the schema's groups in their fixed
      // order, then the prompt composer. Seed is behind Advanced. Agreed in D10.
      expect(controlOrder(container)).toEqual([
        'media-provider',
        'media-model',
        'media-device',
        'media-negative',
        'media-resolution',
        'media-steps',
        'media-guidance',
        'media-frames',
        'media-fps',
        'media-prompt',
      ])
    })

    it('keeps the seed behind the advanced disclosure until asked', () => {
      const { container } = renderForm()
      expect(controlOrder(container)).not.toContain('media-seed')

      showAdvanced()

      expect(controlOrder(container)).toContain('media-seed')
    })

    it('reveals the reference image control only in image to video', () => {
      const { container } = renderForm()
      expect(controlOrder(container)).not.toContain('media-input-image')

      const other = renderForm({ task: 'image_to_video' })
      expect(controlOrder(other.container)).toContain('media-input-image')
      void container
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
      expect(screen.getByLabelText('Negative prompt')).toHaveAttribute(
        'id',
        'media-negative'
      )
      expect(screen.getByLabelText('Prompt')).toHaveAttribute('id', 'media-prompt')
    })

    it('captions each control with the words shown today', () => {
      const { container } = renderForm()

      expect(visibleLabels(container)).toEqual({
        'media-provider': 'Provider',
        'media-model': 'Model',
        'media-device': 'Device',
        'media-negative': 'Negative prompt',
        'media-resolution': 'Resolution',
        'media-steps': 'Steps',
        'media-guidance': 'Guidance',
        'media-frames': 'Frames',
        'media-fps': 'FPS',
        'media-prompt': 'Prompt',
      })
    })
  })

  describe('defaults, taken from the model the worker reported', () => {
    it('applies the model defaults on first render', () => {
      renderForm()
      const defaults = v1Model?.defaults ?? {}

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

    it('selects the device the model requires', () => {
      renderForm()

      expect(screen.getByLabelText('Device')).toHaveValue(
        v1Model?.fitness?.required_device
      )
    })

    it('leaves the seed blank so the provider picks one', () => {
      renderForm()
      showAdvanced()

      expect(screen.getByLabelText('Seed')).toHaveValue(null)
    })

    it('lists every resolution the model declares', () => {
      renderForm()

      const options = within(screen.getByLabelText('Resolution'))
        .getAllByRole('option')
        .map((node) => node.textContent)

      expect(options).toEqual(
        (v1Model?.resolutions ?? []).map(
          (item) => `${item.width} × ${item.height}`
        )
      )
    })
  })

  describe('bounds, taken from the ranges the worker reported', () => {
    it('bounds Frames by the frame rule', () => {
      renderForm()
      const frames = screen.getByLabelText('Frames')

      expect(frames).toHaveAttribute('min', String(v1Model?.frame_rule?.min))
      expect(frames).toHaveAttribute('max', String(v1Model?.frame_rule?.max))
    })

    it('bounds FPS, Steps and Guidance by their declared ranges', () => {
      renderForm()
      const ranges = v1Model?.ranges ?? {}

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

    it('explains an empty task instead of rendering an unusable form', () => {
      const { container } = renderForm({ models: [] })

      expect(
        screen.getByText('No models available for this task')
      ).toBeInTheDocument()
      expect(controlOrder(container)).toEqual(['media-prompt'])
    })
  })
})
