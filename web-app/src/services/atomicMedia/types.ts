export type AtomicMediaJobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'

export type AtomicMediaJobKind =
  | 'text_to_image'
  | 'image_to_image'
  | 'text_to_video'
  | 'image_to_video'

export type AtomicMediaHealth = {
  service: string
  version: string
  status: string
}

export type AtomicMediaDevice = {
  id: string
  label: string
  backend?: string
  vram_total_mb?: number
  vram_free_mb?: number
}

export type AtomicMediaResolution = {
  width: number
  height: number
}

export type AtomicMediaFrameRule = {
  modulus: number
  offset: number
  min: number
  max: number
}

export type AtomicMediaNumericRange = {
  min: number
  max: number
}

export type AtomicMediaModelFitness = {
  status: 'recommended' | 'runnable' | 'degraded' | 'unsupported'
  reason?: string | null
  required_device?: string | null
  notes?: string[]
}

export type AtomicMediaModel = {
  id: string
  label: string
  repo?: string
  backend?: string
  installed?: boolean
  kinds: AtomicMediaJobKind[]
  resolutions?: AtomicMediaResolution[]
  frame_rule?: AtomicMediaFrameRule
  defaults?: Partial<{
    width: number
    height: number
    num_frames: number
    fps: number
    steps: number
    guidance_scale: number
  }>
  ranges?: Partial<{
    num_frames: AtomicMediaNumericRange
    fps: AtomicMediaNumericRange
    steps: AtomicMediaNumericRange
    guidance_scale: AtomicMediaNumericRange
  }>
  supports?: Partial<{
    negative_prompt: boolean
    seed: boolean
    input_image: boolean
  }>
  fitness?: AtomicMediaModelFitness
}

export type AtomicMediaRecommendation = {
  kind: AtomicMediaJobKind
  model_id: string
  defaults?: AtomicMediaModel['defaults']
}

export type AtomicMediaCapabilities = {
  contract_version?: number
  backends?: Array<{
    id: string
    available: boolean
    version?: string
  }>
  devices?: AtomicMediaDevice[]
  models?: AtomicMediaModel[]
  recommended?: AtomicMediaRecommendation[]
}

export type AtomicMediaJobRequest = {
  kind: AtomicMediaJobKind
  prompt: string
  device?: string
  preset?: string
  model_id?: string
  input_image?: string
  negative_prompt?: string
  width?: number
  height?: number
  num_frames?: number
  steps?: number
  guidance_scale?: number
  fps?: number
  seed?: number
}

export type AtomicMediaJobSnapshot = {
  job_id: string
  status: AtomicMediaJobStatus
  kind?: AtomicMediaJobKind
  prompt?: string
  requested_device?: string
  selected_device?: string | null
  model_id?: string | null
  preset?: string | null
  width?: number
  height?: number
  num_frames?: number
  steps?: number
  guidance_scale?: number
  fps?: number
  seed?: number | null
  output_path?: string | null
  error?: string | null
  progress?: number | null
  queue_position?: number | null
  jobs_ahead?: number | null
}
