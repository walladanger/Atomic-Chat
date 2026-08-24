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

export type AtomicMediaCapabilities = Record<string, unknown>

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
