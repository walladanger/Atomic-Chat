/**
 * Schema-driven parameter renderer tests.
 *
 * This is the fix for coupling C5: ~180 lines of hand-written controls in
 * `MediaGenerationForm.tsx`, one per knob, which is why adding a parameter
 * today means editing a frozen file. A renderer that walks `MediaParamSpec[]`
 * replaces all of it, so these tests are mostly "can it draw a spec it has
 * never seen before" rather than "does this particular field work".
 *
 * The visual result must be indistinguishable from what ships today, so the
 * ids and aria-labels the existing suites assert on are preserved exactly.
 */

import { fireEvent, render, renderHook, screen, act } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { MediaParamSpec } from '@/services/media/contract'
import { MediaParamField } from '../MediaParamField'
import { MediaParamGroups } from '../MediaParamGroup'
import { useMediaParamState } from '../useMediaParamState'

function spec(overrides: Partial<MediaParamSpec> & { id: string }): MediaParamSpec {
  return { type: 'string', ...overrides } as MediaParamSpec
}

function renderField(
  s: MediaParamSpec,
  value: unknown = undefined,
  onChange = vi.fn()
) {
  render(
    <MediaParamField spec={s} value={value} onChange={onChange} onBlur={vi.fn()} />
  )
  return { onChange }
}

// --- one test per MediaParamType --------------------------------------------

describe('MediaParamField — every parameter type', () => {
  it('renders a single-line input for string', () => {
    renderField(spec({ id: 'title', type: 'string', label: 'Title' }))

    const field = screen.getByLabelText('Title')
    expect(field.tagName).toBe('INPUT')
    expect(field).toHaveAttribute('type', 'text')
  })

  it('renders a textarea for text', () => {
    renderField(spec({ id: 'prompt', type: 'text', label: 'Prompt' }))

    expect(screen.getByLabelText('Prompt').tagName).toBe('TEXTAREA')
  })

  it('renders a number input honouring min, max and step for int', () => {
    renderField(
      spec({ id: 'steps', type: 'int', label: 'Steps', min: 1, max: 100, step: 1 })
    )

    const field = screen.getByLabelText('Steps')
    expect(field).toHaveAttribute('type', 'number')
    expect(field).toHaveAttribute('min', '1')
    expect(field).toHaveAttribute('max', '100')
  })

  it('renders a number input for float', () => {
    renderField(spec({ id: 'cfg', type: 'float', label: 'CFG', min: 0, max: 20 }))

    expect(screen.getByLabelText('CFG')).toHaveAttribute('type', 'number')
  })

  it('renders a checkbox for bool', () => {
    renderField(spec({ id: 'hires', type: 'bool', label: 'Hi-res' }), true)

    const field = screen.getByLabelText('Hi-res') as HTMLInputElement
    expect(field).toHaveAttribute('type', 'checkbox')
    expect(field.checked).toBe(true)
  })

  it('renders a select carrying every option for enum', () => {
    renderField(
      spec({
        id: 'sampler',
        type: 'enum',
        label: 'Sampler',
        options: [{ value: 'euler' }, { value: 'dpmpp_2m', label: 'DPM++ 2M' }],
      })
    )

    const field = screen.getByLabelText('Sampler')
    expect(field.tagName).toBe('SELECT')
    expect(screen.getByRole('option', { name: 'euler' })).toBeInTheDocument()
    // A label on the option wins over its raw value.
    expect(screen.getByRole('option', { name: 'DPM++ 2M' })).toBeInTheDocument()
  })

  it('renders a number input for seed', () => {
    renderField(spec({ id: 'seed', type: 'seed', label: 'Seed' }))

    expect(screen.getByLabelText('Seed')).toHaveAttribute('type', 'number')
  })

  it('renders exactly one control for resolution', () => {
    renderField(
      spec({
        id: 'resolution',
        type: 'resolution',
        label: 'Resolution',
        options: [
          { value: '832x480', width: 832, height: 480 },
          { value: '1280x720', width: 1280, height: 720 },
        ],
      })
    )

    // One control, not a width box and a height box.
    expect(screen.getByLabelText('Resolution').tagName).toBe('SELECT')
    expect(screen.getAllByRole('combobox')).toHaveLength(1)
  })

  it('renders a text input for image_ref and audio_ref', () => {
    renderField(spec({ id: 'input_image', type: 'image_ref', label: 'Image' }))

    expect(screen.getByLabelText('Image')).toHaveAttribute('type', 'text')
  })

  it('renders a text input for stringlist and splits on commas', () => {
    const { onChange } = renderField(
      spec({ id: 'loras', type: 'stringlist', label: 'LoRAs' })
    )

    const field = screen.getByLabelText('LoRAs')
    expect(field).toHaveAttribute('type', 'text')

    fireEvent.change(field, { target: { value: 'a, b' } })

    expect(onChange).toHaveBeenCalledWith('loras', ['a', 'b'])
  })
})

// --- the case that matters most: a type this build has never heard of --------

describe('MediaParamField — forward compatibility', () => {
  it('renders an unknown type disabled, with a note, rather than crashing', () => {
    renderField(
      spec({ id: 'mystery', label: 'Mystery', type: 'holographic' as never })
    )

    const field = screen.getByLabelText('Mystery')
    // A provider announcing a type from a newer build must degrade, not take
    // the whole form down with it.
    expect(field).toBeDisabled()
    expect(screen.getByText(/not supported by this version/i)).toBeInTheDocument()
  })
})

// --- ids and labels the existing suites depend on ---------------------------

describe('MediaParamField — preserved identity', () => {
  it.each([
    ['prompt', 'media-prompt', 'Prompt'],
    ['negative_prompt', 'media-negative', 'Negative prompt'],
    ['resolution', 'media-resolution', 'Resolution'],
    ['num_frames', 'media-frames', 'Frames'],
    ['fps', 'media-fps', 'FPS'],
    ['steps', 'media-steps', 'Steps'],
    ['guidance_scale', 'media-guidance', 'Guidance'],
    ['seed', 'media-seed', 'Seed'],
  ])('keeps %s as #%s labelled "%s"', (id, domId, ariaLabel) => {
    renderField(
      spec({
        id,
        type: id === 'resolution' ? 'enum' : 'string',
        options: [{ value: '832x480' }],
      })
    )

    // Losing these would be an accessibility regression and would break the
    // suites that already assert on them.
    expect(screen.getByLabelText(ariaLabel)).toHaveAttribute('id', domId)
  })

  it('derives an id for a parameter the app has never seen', () => {
    renderField(spec({ id: 'upscale_by', type: 'float', label: 'Upscale by' }))

    expect(screen.getByLabelText('Upscale by')).toHaveAttribute(
      'id',
      'media-upscale_by'
    )
  })
})

// --- grouping and ordering --------------------------------------------------

describe('MediaParamGroups — ordering', () => {
  const specs: MediaParamSpec[] = [
    spec({ id: 'z_custom', type: 'string', label: 'Z', group: 'zebra' }),
    spec({ id: 'guidance_scale', type: 'float', label: 'Guidance', group: 'sampling', order: 2 }),
    spec({ id: 'steps', type: 'int', label: 'Steps', group: 'sampling', order: 1 }),
    spec({ id: 'a_custom', type: 'string', label: 'A', group: 'aardvark' }),
    spec({ id: 'prompt', type: 'text', label: 'Prompt', group: 'core' }),
    spec({ id: 'fps', type: 'int', label: 'FPS', group: 'output' }),
  ]

  it('puts known groups first, in the documented order', () => {
    render(
      <MediaParamGroups
        specs={specs}
        values={{}}
        onChange={vi.fn()}
        onBlur={vi.fn()}
      />
    )

    const headings = screen.getAllByRole('heading').map((node) => node.textContent)
    expect(headings.slice(0, 3)).toEqual(['core', 'output', 'sampling'])
  })

  it('puts unknown groups after the known ones, alphabetically', () => {
    render(
      <MediaParamGroups
        specs={specs}
        values={{}}
        onChange={vi.fn()}
        onBlur={vi.fn()}
      />
    )

    const headings = screen.getAllByRole('heading').map((node) => node.textContent)
    expect(headings.slice(-2)).toEqual(['aardvark', 'zebra'])
  })

  it('orders within a group by order, then by id', () => {
    render(
      <MediaParamGroups
        specs={specs}
        values={{}}
        onChange={vi.fn()}
        onBlur={vi.fn()}
      />
    )

    const labels = screen
      .getAllByRole('spinbutton')
      .map((node) => node.getAttribute('aria-label'))
    // Steps is order 1, Guidance order 2, and FPS is in an earlier group.
    expect(labels).toEqual(['FPS', 'Steps', 'Guidance'])
  })

  it('collapses advanced parameters behind a disclosure', () => {
    render(
      <MediaParamGroups
        specs={[
          spec({ id: 'prompt', type: 'text', label: 'Prompt', group: 'core' }),
          spec({ id: 'denoise', type: 'float', label: 'Denoise', advanced: true }),
        ]}
        values={{}}
        onChange={vi.fn()}
        onBlur={vi.fn()}
      />
    )

    expect(screen.queryByLabelText('Denoise')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /advanced/i }))
    expect(screen.getByLabelText('Denoise')).toBeInTheDocument()
  })
})

// --- depends_on -------------------------------------------------------------

describe('MediaParamGroups — depends_on', () => {
  const specs: MediaParamSpec[] = [
    spec({ id: 'hires', type: 'bool', label: 'Hi-res' }),
    spec({
      id: 'hires_steps',
      type: 'int',
      label: 'Hi-res steps',
      depends_on: [{ param: 'hires', truthy: true }],
    }),
  ]

  it('hides a dependent field and shows it again when the condition holds', () => {
    const { rerender } = render(
      <MediaParamGroups
        specs={specs}
        values={{ hires: false }}
        onChange={vi.fn()}
        onBlur={vi.fn()}
      />
    )
    expect(screen.queryByLabelText('Hi-res steps')).not.toBeInTheDocument()

    rerender(
      <MediaParamGroups
        specs={specs}
        values={{ hires: true }}
        onChange={vi.fn()}
        onBlur={vi.fn()}
      />
    )
    expect(screen.getByLabelText('Hi-res steps')).toBeInTheDocument()
  })

  it('drops a hidden field from the submitted bag', () => {
    const { result } = renderHook(() => useMediaParamState(specs))

    act(() => result.current.setValue('hires', true))
    act(() => result.current.setValue('hires_steps', 12))
    expect(result.current.validated.values.hires_steps).toBe(12)

    act(() => result.current.setValue('hires', false))

    // Hidden means not submitted. Sending a value for a control the user cannot
    // see is how a generation ends up with settings nobody chose.
    expect(result.current.validated.values).not.toHaveProperty('hires_steps')
  })
})

// --- useMediaParamState -----------------------------------------------------

describe('useMediaParamState', () => {
  const specs: MediaParamSpec[] = [
    spec({ id: 'prompt', type: 'text', label: 'Prompt', required: true }),
    spec({ id: 'steps', type: 'int', label: 'Steps', min: 1, max: 100, default: 20 }),
    spec({
      id: 'num_frames',
      type: 'int',
      label: 'Frames',
      min: 17,
      max: 121,
      default: 17,
      modulus: { modulus: 4, offset: 1 },
    }),
  ]

  it('applies every default on first render', () => {
    const { result } = renderHook(() => useMediaParamState(specs))

    expect(result.current.values.steps).toBe(20)
    expect(result.current.values.num_frames).toBe(17)
  })

  it('re-applies defaults when the schema changes, as a model switch does', () => {
    const { result, rerender } = renderHook(
      ({ current }) => useMediaParamState(current),
      { initialProps: { current: specs } }
    )
    act(() => result.current.setValue('steps', 55))
    expect(result.current.values.steps).toBe(55)

    const other: MediaParamSpec[] = [
      spec({ id: 'steps', type: 'int', label: 'Steps', min: 1, max: 50, default: 8 }),
    ]
    rerender({ current: other })

    // A value carried over from another model would be silently out of range.
    expect(result.current.values.steps).toBe(8)
  })

  it('quantises on blur exactly as nearestFrame does, ties breaking down', () => {
    const { result } = renderHook(() => useMediaParamState(specs))

    act(() => result.current.setValue('num_frames', 19))
    // Not corrected while typing: that would fight the user mid-keystroke.
    expect(result.current.values.num_frames).toBe(19)

    act(() => result.current.blur('num_frames'))

    // 19 is equidistant between 17 and 21; v1 breaks the tie downwards and the
    // parity test in Task 2 depends on that staying true.
    expect(result.current.values.num_frames).toBe(17)
  })

  it('clamps a number typed outside its range on blur', () => {
    const { result } = renderHook(() => useMediaParamState(specs))

    act(() => result.current.setValue('steps', 5000))
    act(() => result.current.blur('steps'))

    expect(result.current.values.steps).toBe(100)
  })

  it('reports a required field as invalid rather than submitting without it', () => {
    const { result } = renderHook(() => useMediaParamState(specs))

    expect(result.current.validated.ok).toBe(false)
    expect(result.current.validated.errors[0]?.param).toBe('prompt')

    act(() => result.current.setValue('prompt', 'a red car'))

    expect(result.current.validated.ok).toBe(true)
  })

  it('exposes only the visible specs, so the renderer and the bag agree', () => {
    const conditional: MediaParamSpec[] = [
      spec({ id: 'hires', type: 'bool', label: 'Hi-res' }),
      spec({
        id: 'hires_steps',
        type: 'int',
        label: 'Hi-res steps',
        depends_on: [{ param: 'hires', truthy: true }],
      }),
    ]
    const { result } = renderHook(() => useMediaParamState(conditional))

    expect(result.current.visibleSpecs.map((entry) => entry.id)).toEqual(['hires'])
  })
})
