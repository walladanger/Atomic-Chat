import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MediaStudio } from './MediaStudio'

const submit = vi.fn()
const refreshHealth = vi.fn()
let hookState: Record<string, unknown>

const defaultCapabilities = {
  contract_version: 1,
  devices: [{ id: 'cuda:0', label: 'RTX 3090', backend: 'cuda' }],
  models: [
    {
      id: 'registry-video',
      label: 'Registry Video',
      backend: 'comfyui',
      installed: true,
      kinds: ['text_to_video', 'image_to_video'],
      resolutions: [
        { width: 832, height: 480 },
        { width: 1280, height: 704 },
      ],
      frame_rule: { modulus: 4, offset: 1, min: 17, max: 121 },
      defaults: {
        width: 832,
        height: 480,
        num_frames: 17,
        fps: 12,
        steps: 10,
        guidance_scale: 5,
      },
      ranges: {
        steps: { min: 1, max: 60 },
        guidance_scale: { min: 0, max: 15 },
        fps: { min: 8, max: 30 },
      },
      supports: {
        negative_prompt: true,
        seed: true,
        input_image: true,
      },
      fitness: { status: 'recommended', required_device: 'cuda:0' },
    },
  ],
  recommended: [
    {
      kind: 'text_to_video',
      model_id: 'registry-video',
      defaults: {
        width: 832,
        height: 480,
        num_frames: 17,
        fps: 12,
        steps: 10,
        guidance_scale: 5,
      },
    },
  ],
}

vi.mock('@/hooks/useAtomicMediaJob', () => ({
  useAtomicMediaJob: () => hookState,
}))

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
}))

describe('MediaStudio', () => {
  beforeEach(() => {
    submit.mockReset()
    refreshHealth.mockReset()
    hookState = {
      workerState: 'online',
      workerHealth: {
        service: 'atomic-media-worker',
        version: '0.6.1',
        status: 'ok',
      },
      job: null,
      error: null,
      capabilities: defaultCapabilities,
      submit,
      cancelPolling: vi.fn(),
      refreshHealth,
    }
  })

  it('renders the approved core generation controls', () => {
    render(<MediaStudio />)

    expect(screen.getByRole('heading', { name: 'Media Studio' })).toBeInTheDocument()
    expect(screen.getByLabelText('Prompt')).toBeInTheDocument()
    expect(screen.getByLabelText('Resolution')).toBeInTheDocument()
    expect(screen.getByLabelText('Frames')).toBeInTheDocument()
    expect(screen.getByLabelText('FPS')).toBeInTheDocument()
    expect(screen.getByLabelText('Steps')).toBeInTheDocument()
    expect(screen.getByLabelText('Guidance')).toBeInTheDocument()
    expect(screen.getByLabelText('Seed')).toBeInTheDocument()
    expect(screen.getByLabelText('Device')).toHaveValue('cuda:0')
    expect(screen.getByLabelText('Negative prompt')).toBeInTheDocument()
  })

  it('submits exact baseline registry settings from the form', () => {
    render(<MediaStudio />)

    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: 'A red sports car exits a garage' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }))

    expect(submit).toHaveBeenCalledWith({
      kind: 'text_to_video',
      prompt: 'A red sports car exits a garage',
      device: 'cuda:0',
      model_id: 'registry-video',
      width: 832,
      height: 480,
      num_frames: 17,
      steps: 10,
      fps: 12,
      guidance_scale: 5,
    })
  })

  it('renders worker-declared models and submits the selected model id', () => {
    hookState = {
      ...hookState,
      capabilities: {
        contract_version: 1,
        devices: [
          { id: 'cuda:0', label: 'RTX 3090', backend: 'cuda' },
          { id: 'cpu', label: 'CPU', backend: 'cpu' },
        ],
        models: [
          {
            id: 'second-registry-video',
            label: 'Second Registry Video',
            backend: 'comfyui',
            installed: true,
            kinds: ['text_to_video', 'image_to_video'],
            resolutions: [{ width: 768, height: 512 }],
            frame_rule: { modulus: 8, offset: 1, min: 9, max: 249 },
            defaults: {
              width: 768,
              height: 512,
              num_frames: 105,
              fps: 24,
              steps: 28,
              guidance_scale: 3.5,
            },
            ranges: {
              steps: { min: 1, max: 60 },
              guidance_scale: { min: 0, max: 10 },
              fps: { min: 8, max: 30 },
            },
            supports: {
              negative_prompt: true,
              seed: true,
              input_image: true,
            },
            fitness: { status: 'recommended', required_device: 'cuda:0' },
          },
          {
            id: 'unsupported-registry-video',
            label: 'Unsupported Registry Video',
            backend: 'comfyui',
            installed: true,
            kinds: ['text_to_video'],
            resolutions: [{ width: 1280, height: 704 }],
            defaults: {},
            supports: {},
            fitness: {
              status: 'unsupported',
              reason: 'Insufficient VRAM',
            },
          },
        ],
        recommended: [
          {
            kind: 'text_to_video',
            model_id: 'second-registry-video',
            defaults: {
              width: 768,
              height: 512,
              num_frames: 105,
              fps: 24,
              steps: 28,
              guidance_scale: 3.5,
            },
          },
        ],
      },
    }

    render(<MediaStudio />)

    expect(screen.getByLabelText('Model')).toHaveValue('second-registry-video')
    expect(screen.getByText('Second Registry Video · Local Worker')).toBeInTheDocument()
    expect(screen.getByLabelText('Resolution')).toHaveValue('768x512')
    expect(screen.getByLabelText('Device')).toHaveValue('cuda:0')
    expect(
      screen.getByRole('option', { name: /Unsupported Registry Video/ })
    ).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: 'A glass bird folds into light' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }))

    expect(submit).toHaveBeenCalledWith({
      kind: 'text_to_video',
      prompt: 'A glass bird folds into light',
      device: 'cuda:0',
      model_id: 'second-registry-video',
      width: 768,
      height: 512,
      num_frames: 105,
      steps: 28,
      fps: 24,
      guidance_scale: 3.5,
    })
  })

  it('rounds frame counts to the selected model rule before submitting', () => {
    render(<MediaStudio />)

    fireEvent.change(screen.getByLabelText('Frames'), {
      target: { value: '20' },
    })
    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: 'A careful camera move through fog' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }))

    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        num_frames: 21,
      })
    )
  })

  it('shows worker-offline state and allows a health retry', () => {
    hookState = {
      ...hookState,
      workerState: 'offline',
      workerHealth: null,
    }
    render(<MediaStudio />)

    expect(screen.getByText('Worker offline')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry worker' }))
    expect(refreshHealth).toHaveBeenCalled()
  })

  it('renders progress and completed video output', () => {
    hookState = {
      ...hookState,
      job: {
        job_id: 'job-1',
        status: 'running',
        progress: 68,
        selected_device: 'cuda:0',
      },
    }
    const { rerender } = render(<MediaStudio />)
    expect(screen.getByText('68%')).toBeInTheDocument()

    hookState = {
      ...hookState,
      job: {
        job_id: 'job-1',
        status: 'succeeded',
        kind: 'text_to_video',
        output_path: 'D:/AtomicMedia/outputs/jobs/job-1.mp4',
      },
    }
    rerender(<MediaStudio />)

    const video = screen.getByTestId('media-video-preview')
    expect(video).toHaveAttribute(
      'src',
      'asset://D:/AtomicMedia/outputs/jobs/job-1.mp4'
    )
  })
})
