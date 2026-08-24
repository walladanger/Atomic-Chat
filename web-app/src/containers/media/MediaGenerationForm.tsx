import { useState } from 'react'
import { cn } from '@/lib/utils'
import type {
  AtomicMediaJobKind,
  AtomicMediaJobRequest,
} from '@/services/atomicMedia/types'

const fieldClass =
  'h-9 w-full rounded-lg border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus:border-foreground/30 focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50'

const labelClass = 'mb-1.5 block text-xs font-medium text-muted-foreground'

type MediaGenerationFormProps = {
  disabled?: boolean
  onSubmit: (request: AtomicMediaJobRequest) => void | Promise<unknown>
}

type Mode = Extract<
  AtomicMediaJobKind,
  'text_to_video' | 'image_to_video' | 'text_to_image'
>

export function MediaGenerationForm({
  disabled = false,
  onSubmit,
}: MediaGenerationFormProps) {
  const [mode, setMode] = useState<Mode>('text_to_video')
  const [prompt, setPrompt] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [resolution, setResolution] = useState('832x480')
  const [frames, setFrames] = useState(17)
  const [fps, setFps] = useState(12)
  const [steps, setSteps] = useState(10)
  const [guidance, setGuidance] = useState(5)
  const [seed, setSeed] = useState('')
  const [device, setDevice] = useState('auto')
  const [inputImage, setInputImage] = useState('')

  const switchMode = (nextMode: Mode) => {
    setMode(nextMode)
    if (nextMode === 'text_to_image') {
      setResolution('1024x1024')
      setSteps(30)
      setGuidance(7.5)
      return
    }
    if (nextMode === 'image_to_video') {
      setResolution('832x480')
      setFrames(81)
      setFps(16)
      setSteps(50)
      setGuidance(5)
      return
    }
    setResolution('832x480')
    setFrames(17)
    setFps(12)
    setSteps(10)
    setGuidance(5)
  }

  const submit = () => {
    const trimmedPrompt = prompt.trim()
    if (!trimmedPrompt) return

    const [width, height] = resolution.split('x').map(Number)
    const request: AtomicMediaJobRequest = {
      kind: mode,
      prompt: trimmedPrompt,
      device,
      preset:
        mode === 'text_to_image'
          ? 'quality'
          : mode === 'image_to_video'
            ? 'wan2.2-i2v-a14b-480p'
            : 'wan2.2-ti2v-5b',
      width,
      height,
      steps,
      guidance_scale: guidance,
      ...(negativePrompt.trim()
        ? { negative_prompt: negativePrompt.trim() }
        : {}),
      ...(seed.trim() ? { seed: Number(seed) } : {}),
      ...(mode !== 'text_to_image' ? { num_frames: frames, fps } : {}),
      ...(mode === 'image_to_video' && inputImage.trim()
        ? { input_image: inputImage.trim() }
        : {}),
    }

    void onSubmit(request)
  }

  const isVideo = mode !== 'text_to_image'

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="rounded-xl border border-border/60 bg-background p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-1 rounded-lg bg-muted/70 p-1">
          {[
            ['text_to_video', 'Text → Video'],
            ['image_to_video', 'Image → Video'],
            ['text_to_image', 'Image'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => switchMode(value as Mode)}
              className={cn(
                'flex-1 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition',
                mode === value &&
                  'bg-background text-foreground shadow-sm ring-1 ring-border/60'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass}>Model</label>
            <select className={fieldClass} value={mode} disabled>
              <option value="text_to_video">Wan 2.2 TI2V 5B — Diffusers</option>
              <option value="image_to_video">Wan 2.2 I2V A14B — Diffusers</option>
              <option value="text_to_image">SDXL — Diffusers</option>
            </select>
          </div>

          <div>
            <label htmlFor="media-resolution" className={labelClass}>
              Resolution
            </label>
            <select
              id="media-resolution"
              aria-label="Resolution"
              className={fieldClass}
              value={resolution}
              onChange={(event) => setResolution(event.target.value)}
              disabled={disabled}
            >
              {mode === 'text_to_image' ? (
                <>
                  <option value="1024x1024">1024 × 1024</option>
                  <option value="1152x896">1152 × 896</option>
                  <option value="896x1152">896 × 1152</option>
                </>
              ) : (
                <>
                  <option value="832x480">832 × 480</option>
                  <option value="1280x704">1280 × 704</option>
                </>
              )}
            </select>
          </div>

          <div>
            <label htmlFor="media-device" className={labelClass}>
              Device
            </label>
            <select
              id="media-device"
              aria-label="Device"
              className={fieldClass}
              value={device}
              onChange={(event) => setDevice(event.target.value)}
              disabled={disabled}
            >
              <option value="auto">Auto</option>
              <option value="cpu">CPU</option>
            </select>
          </div>

          {isVideo && (
            <>
              <div>
                <label htmlFor="media-frames" className={labelClass}>
                  Frames
                </label>
                <input
                  id="media-frames"
                  aria-label="Frames"
                  className={fieldClass}
                  type="number"
                  min={1}
                  value={frames}
                  onChange={(event) => setFrames(Number(event.target.value))}
                  disabled={disabled}
                />
              </div>
              <div>
                <label htmlFor="media-fps" className={labelClass}>
                  FPS
                </label>
                <input
                  id="media-fps"
                  aria-label="FPS"
                  className={fieldClass}
                  type="number"
                  min={1}
                  value={fps}
                  onChange={(event) => setFps(Number(event.target.value))}
                  disabled={disabled}
                />
              </div>
            </>
          )}

          <div>
            <label htmlFor="media-steps" className={labelClass}>
              Steps
            </label>
            <input
              id="media-steps"
              aria-label="Steps"
              className={fieldClass}
              type="number"
              min={1}
              value={steps}
              onChange={(event) => setSteps(Number(event.target.value))}
              disabled={disabled}
            />
          </div>
          <div>
            <label htmlFor="media-guidance" className={labelClass}>
              Guidance
            </label>
            <input
              id="media-guidance"
              aria-label="Guidance"
              className={fieldClass}
              type="number"
              min={0}
              step={0.1}
              value={guidance}
              onChange={(event) => setGuidance(Number(event.target.value))}
              disabled={disabled}
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="media-seed" className={labelClass}>
              Seed
            </label>
            <input
              id="media-seed"
              aria-label="Seed"
              className={fieldClass}
              type="number"
              placeholder="Random"
              value={seed}
              onChange={(event) => setSeed(event.target.value)}
              disabled={disabled}
            />
          </div>

          {mode === 'image_to_video' && (
            <div className="sm:col-span-2">
              <label htmlFor="media-input-image" className={labelClass}>
                Reference image path
              </label>
              <input
                id="media-input-image"
                className={fieldClass}
                placeholder="D:\\Images\\reference.png"
                value={inputImage}
                onChange={(event) => setInputImage(event.target.value)}
                disabled={disabled}
              />
            </div>
          )}

          <div className="sm:col-span-2">
            <label htmlFor="media-negative" className={labelClass}>
              Negative prompt
            </label>
            <textarea
              id="media-negative"
              aria-label="Negative prompt"
              className="min-h-20 w-full resize-y rounded-lg border border-border/70 bg-background px-3 py-2 text-sm outline-none transition focus:border-foreground/30 focus:ring-2 focus:ring-ring/30"
              placeholder="warping, morphing, duplicated objects, frame jumps..."
              value={negativePrompt}
              onChange={(event) => setNegativePrompt(event.target.value)}
              disabled={disabled}
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border/70 bg-background p-3 shadow-sm">
        <label htmlFor="media-prompt" className="sr-only">
          Prompt
        </label>
        <textarea
          id="media-prompt"
          aria-label="Prompt"
          className="min-h-24 w-full resize-none bg-transparent px-1 py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          placeholder="Describe what you want to create..."
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          disabled={disabled}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            Local generation · settings are sent directly to Atomic Media
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={disabled || !prompt.trim()}
            className="rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Generate
          </button>
        </div>
      </div>
    </div>
  )
}
