import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import type {
  AtomicMediaCapabilities,
  AtomicMediaJobKind,
  AtomicMediaJobRequest,
  AtomicMediaModel,
  AtomicMediaRecommendation,
} from '@/services/atomicMedia/types'

const fieldClass =
  'h-9 w-full rounded-lg border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus:border-foreground/30 focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50'

const labelClass = 'mb-1.5 block text-xs font-medium text-muted-foreground'

type MediaGenerationFormProps = {
  capabilities: AtomicMediaCapabilities | null
  disabled?: boolean
  onSelectedModelChange?: (model: AtomicMediaModel | null) => void
  onSubmit: (request: AtomicMediaJobRequest) => void | Promise<unknown>
}

type Mode = Extract<
  AtomicMediaJobKind,
  'text_to_video' | 'image_to_video' | 'text_to_image'
>

const MODES: Array<[Mode, string]> = [
  ['text_to_video', 'Text → Video'],
  ['image_to_video', 'Image → Video'],
  ['text_to_image', 'Image'],
]

function resolutionValue(width: number, height: number) {
  return `${width}x${height}`
}

function isSelectable(model: AtomicMediaModel) {
  return model.installed !== false && model.fitness?.status !== 'unsupported'
}

function modelDefaults(
  model: AtomicMediaModel | null,
  recommendation: AtomicMediaRecommendation | undefined
) {
  return {
    ...model?.defaults,
    ...recommendation?.defaults,
  }
}

function optionLabel(model: AtomicMediaModel) {
  const status = model.fitness?.status
  const reason = model.fitness?.reason
  if (!status || status === 'recommended') return model.label
  return reason ? `${model.label} — ${status}: ${reason}` : `${model.label} — ${status}`
}

function clamp(value: number, min?: number, max?: number) {
  let next = Number.isFinite(value) ? value : min ?? 0
  if (typeof min === 'number') next = Math.max(min, next)
  if (typeof max === 'number') next = Math.min(max, next)
  return next
}

function nearestFrame(value: number, rule: AtomicMediaModel['frame_rule']) {
  if (!rule) return value
  const bounded = clamp(value, rule.min, rule.max)
  const base = bounded - rule.offset
  const lower = Math.floor(base / rule.modulus) * rule.modulus + rule.offset
  const upper = Math.ceil(base / rule.modulus) * rule.modulus + rule.offset
  const nearest = Math.abs(bounded - lower) <= Math.abs(upper - bounded) ? lower : upper
  return clamp(nearest, rule.min, rule.max)
}

export function MediaGenerationForm({
  capabilities,
  disabled = false,
  onSelectedModelChange,
  onSubmit,
}: MediaGenerationFormProps) {
  const [mode, setMode] = useState<Mode>('text_to_video')
  const [selectedModelId, setSelectedModelId] = useState('')
  const [prompt, setPrompt] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [resolution, setResolution] = useState('')
  const [frames, setFrames] = useState(0)
  const [fps, setFps] = useState(0)
  const [steps, setSteps] = useState(0)
  const [guidance, setGuidance] = useState(0)
  const [seed, setSeed] = useState('')
  const [device, setDevice] = useState('')
  const [inputImage, setInputImage] = useState('')

  const capabilitiesSupported = capabilities?.contract_version === 1
  const models = useMemo(
    () => (capabilitiesSupported ? capabilities.models ?? [] : []),
    [capabilities?.models, capabilitiesSupported]
  )
  const devices = useMemo(
    () => (capabilitiesSupported ? capabilities.devices ?? [] : []),
    [capabilities?.devices, capabilitiesSupported]
  )

  const modeModels = useMemo(
    () => models.filter((model) => model.kinds.includes(mode)),
    [mode, models]
  )
  const recommendation = capabilities?.recommended?.find(
    (item) => item.kind === mode
  )
  const selectedModel = modeModels.find((model) => model.id === selectedModelId) ?? null
  const selectedDefaults = modelDefaults(selectedModel, recommendation)
  const isVideo = mode !== 'text_to_image'
  const supports = selectedModel?.supports ?? {}
  const stepRange = selectedModel?.ranges?.steps
  const fpsRange = selectedModel?.ranges?.fps
  const guidanceRange = selectedModel?.ranges?.guidance_scale
  const shouldRenderSteps = Boolean(stepRange || selectedDefaults.steps)
  const shouldRenderFps = Boolean(isVideo && (fpsRange || selectedDefaults.fps))
  const shouldRenderGuidance = Boolean(
    guidanceRange || selectedDefaults.guidance_scale
  )

  useEffect(() => {
    const current = modeModels.find(
      (model) => model.id === selectedModelId && isSelectable(model)
    )
    if (current) return

    const recommended = modeModels.find(
      (model) => model.id === recommendation?.model_id && isSelectable(model)
    )
    const firstRunnable = modeModels.find(isSelectable)
    setSelectedModelId(recommended?.id ?? firstRunnable?.id ?? '')
  }, [modeModels, recommendation?.model_id, selectedModelId])

  useEffect(() => {
    const nextDefaults = modelDefaults(selectedModel, recommendation)
    const defaultResolution = selectedModel?.resolutions?.find(
      (item) =>
        item.width === nextDefaults.width && item.height === nextDefaults.height
    )
    const nextResolution = defaultResolution ?? selectedModel?.resolutions?.[0]

    setResolution(
      nextResolution ? resolutionValue(nextResolution.width, nextResolution.height) : ''
    )
    setFrames(
      nearestFrame(
        nextDefaults.num_frames ?? selectedModel?.frame_rule?.min ?? 0,
        selectedModel?.frame_rule
      )
    )
    setFps(
      clamp(
        nextDefaults.fps ?? 0,
        selectedModel?.ranges?.fps?.min,
        selectedModel?.ranges?.fps?.max
      )
    )
    setSteps(
      clamp(
        nextDefaults.steps ?? 0,
        selectedModel?.ranges?.steps?.min,
        selectedModel?.ranges?.steps?.max
      )
    )
    setGuidance(
      clamp(
        nextDefaults.guidance_scale ?? 0,
        selectedModel?.ranges?.guidance_scale?.min,
        selectedModel?.ranges?.guidance_scale?.max
      )
    )
    setDevice(selectedModel?.fitness?.required_device ?? devices[0]?.id ?? '')
    onSelectedModelChange?.(selectedModel)
  }, [devices, onSelectedModelChange, recommendation, selectedModel])

  const submit = () => {
    const trimmedPrompt = prompt.trim()
    if (!trimmedPrompt || !selectedModel || !resolution) return

    const [width, height] = resolution.split('x').map(Number)
    const request: AtomicMediaJobRequest = {
      kind: mode,
      prompt: trimmedPrompt,
      ...(device ? { device } : {}),
      model_id: selectedModel.id,
      width,
      height,
      ...(shouldRenderSteps ? { steps } : {}),
      ...(shouldRenderGuidance ? { guidance_scale: guidance } : {}),
      ...(supports.negative_prompt && negativePrompt.trim()
        ? { negative_prompt: negativePrompt.trim() }
        : {}),
      ...(supports.seed && seed.trim() ? { seed: Number(seed) } : {}),
      ...(isVideo ? { num_frames: nearestFrame(frames, selectedModel.frame_rule) } : {}),
      ...(shouldRenderFps ? { fps } : {}),
      ...(mode === 'image_to_video' && supports.input_image && inputImage.trim()
        ? { input_image: inputImage.trim() }
        : {}),
    }

    void onSubmit(request)
  }

  const formDisabled = disabled || !selectedModel

  if (!capabilitiesSupported) {
    return (
      <div className="rounded-xl border border-border/60 bg-background p-4 shadow-sm">
        <p className="text-sm font-medium text-foreground">
          Media model capabilities unavailable
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Start or update Atomic Media Worker to load available models and devices.
        </p>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="rounded-xl border border-border/60 bg-background p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-1 rounded-lg bg-muted/70 p-1">
          {MODES.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
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

        {modeModels.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/70 p-4">
            <p className="text-sm font-medium text-foreground">
              No models available for this mode
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Install a compatible model in Atomic Media Worker, then refresh.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="media-model" className={labelClass}>
                Model
              </label>
              <select
                id="media-model"
                aria-label="Model"
                className={fieldClass}
                value={selectedModelId}
                onChange={(event) => setSelectedModelId(event.target.value)}
                disabled={disabled}
              >
                {modeModels.map((model) => (
                  <option
                    key={model.id}
                    value={model.id}
                    disabled={!isSelectable(model)}
                  >
                    {optionLabel(model)}
                  </option>
                ))}
              </select>
            </div>

            {selectedModel?.resolutions?.length ? (
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
                  disabled={formDisabled}
                >
                  {selectedModel.resolutions.map((item) => {
                    const value = resolutionValue(item.width, item.height)
                    return (
                      <option key={value} value={value}>
                        {item.width} × {item.height}
                      </option>
                    )
                  })}
                </select>
              </div>
            ) : null}

            {devices.length ? (
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
                  disabled={formDisabled}
                >
                  {devices.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {isVideo && selectedModel?.frame_rule ? (
              <div>
                <label htmlFor="media-frames" className={labelClass}>
                  Frames
                </label>
                <input
                  id="media-frames"
                  aria-label="Frames"
                  className={fieldClass}
                  type="number"
                  min={selectedModel.frame_rule.min}
                  max={selectedModel.frame_rule.max}
                  value={frames}
                  onBlur={() => setFrames(nearestFrame(frames, selectedModel.frame_rule))}
                  onChange={(event) => setFrames(Number(event.target.value))}
                  disabled={formDisabled}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Must be {selectedModel.frame_rule.modulus}n + {selectedModel.frame_rule.offset}.
                </p>
              </div>
            ) : null}

            {shouldRenderFps ? (
              <div>
                <label htmlFor="media-fps" className={labelClass}>
                  FPS
                </label>
                <input
                  id="media-fps"
                  aria-label="FPS"
                  className={fieldClass}
                  type="number"
                  min={fpsRange?.min}
                  max={fpsRange?.max}
                  value={fps}
                  onChange={(event) => setFps(Number(event.target.value))}
                  disabled={formDisabled}
                />
              </div>
            ) : null}

            {shouldRenderSteps ? (
              <div>
                <label htmlFor="media-steps" className={labelClass}>
                  Steps
                </label>
                <input
                  id="media-steps"
                  aria-label="Steps"
                  className={fieldClass}
                  type="number"
                  min={stepRange?.min}
                  max={stepRange?.max}
                  value={steps}
                  onChange={(event) => setSteps(Number(event.target.value))}
                  disabled={formDisabled}
                />
              </div>
            ) : null}

            {shouldRenderGuidance ? (
              <div>
                <label htmlFor="media-guidance" className={labelClass}>
                  Guidance
                </label>
                <input
                  id="media-guidance"
                  aria-label="Guidance"
                  className={fieldClass}
                  type="number"
                  min={guidanceRange?.min}
                  max={guidanceRange?.max}
                  step={0.1}
                  value={guidance}
                  onChange={(event) => setGuidance(Number(event.target.value))}
                  disabled={formDisabled}
                />
              </div>
            ) : null}

            {supports.seed ? (
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
                  disabled={formDisabled}
                />
              </div>
            ) : null}

            {mode === 'image_to_video' && supports.input_image ? (
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
                  disabled={formDisabled}
                />
              </div>
            ) : null}

            {supports.negative_prompt ? (
              <div className="sm:col-span-2">
                <label htmlFor="media-negative" className={labelClass}>
                  Negative prompt
                </label>
                <textarea
                  id="media-negative"
                  aria-label="Negative prompt"
                  className="min-h-20 w-full resize-y rounded-lg border border-border/70 bg-background px-3 py-2 text-sm outline-none transition focus:border-foreground/30 focus:ring-2 focus:ring-ring/30"
                  placeholder="Unwanted elements..."
                  value={negativePrompt}
                  onChange={(event) => setNegativePrompt(event.target.value)}
                  disabled={formDisabled}
                />
              </div>
            ) : null}
          </div>
        )}
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
          disabled={formDisabled}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            Local generation · settings are sent directly to Atomic Media
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={formDisabled || !prompt.trim()}
            className="rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Generate
          </button>
        </div>
      </div>
    </div>
  )
}
