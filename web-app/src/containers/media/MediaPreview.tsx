import { convertFileSrc } from '@tauri-apps/api/core'
import type { AtomicMediaJobSnapshot } from '@/services/atomicMedia/types'

function toPreviewSrc(path: string): string {
  if (/^(https?:|blob:|data:|asset:)/i.test(path)) return path
  return convertFileSrc(path)
}

function isVideoJob(job: AtomicMediaJobSnapshot): boolean {
  if (job.kind === 'text_to_video' || job.kind === 'image_to_video') return true
  return Boolean(job.output_path?.toLowerCase().match(/\.(mp4|webm|mov)$/))
}

type MediaPreviewProps = {
  job: AtomicMediaJobSnapshot | null
}

export function MediaPreview({ job }: MediaPreviewProps) {
  const successfulJob = job?.status === 'succeeded' ? job : null
  const outputPath = successfulJob?.output_path

  return (
    <div className="relative flex min-h-[340px] flex-1 items-center justify-center overflow-hidden rounded-2xl border border-border/60 bg-muted/30 shadow-sm">
      {outputPath ? (
        isVideoJob(successfulJob) ? (
          <video
            data-testid="media-video-preview"
            className="max-h-[58vh] w-full bg-black object-contain"
            src={toPreviewSrc(outputPath)}
            controls
          />
        ) : (
          <img
            data-testid="media-image-preview"
            className="max-h-[58vh] w-full object-contain"
            src={toPreviewSrc(outputPath)}
            alt="Generated media"
          />
        )
      ) : (
        <div className="max-w-sm px-6 text-center">
          <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl border border-border/70 bg-background text-lg shadow-sm">
            ✦
          </div>
          <p className="text-sm font-medium text-foreground">Generation preview</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Your finished image or video will appear here without leaving Atomic
            Chat.
          </p>
        </div>
      )}
    </div>
  )
}
