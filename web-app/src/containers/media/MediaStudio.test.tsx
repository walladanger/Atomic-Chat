import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MediaStudio } from './MediaStudio'

const submit = vi.fn()
const refreshHealth = vi.fn()
let hookState: Record<string, unknown>

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
    expect(screen.getByLabelText('Device')).toHaveValue('auto')
    expect(screen.getByLabelText('Negative prompt')).toBeInTheDocument()
  })

  it('submits exact baseline Wan settings from the form', () => {
    render(<MediaStudio />)

    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: 'A red sports car exits a garage' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }))

    expect(submit).toHaveBeenCalledWith({
      kind: 'text_to_video',
      prompt: 'A red sports car exits a garage',
      device: 'auto',
      preset: 'wan2.2-ti2v-5b',
      width: 832,
      height: 480,
      num_frames: 17,
      steps: 10,
      fps: 12,
      guidance_scale: 5,
    })
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
