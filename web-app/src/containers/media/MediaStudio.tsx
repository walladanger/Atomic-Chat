import { MediaGenerationForm } from './MediaGenerationForm'
import { MediaJobStatus } from './MediaJobStatus'
import { MediaPreview } from './MediaPreview'
import { useAtomicMediaJob } from '@/hooks/useAtomicMediaJob'
import type { AtomicMediaJobRequest } from '@/services/atomicMedia/types'

export function MediaStudio() {
  const {
    workerState,
    workerHealth,
    job,
    error,
    submit,
    refreshHealth,
  } = useAtomicMediaJob()

  const generationBusy = job?.status === 'queued' || job?.status === 'running'

  const handleSubmit = async (request: AtomicMediaJobRequest) => {
    await submit(request)
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-neutral-50 dark:bg-background">
      <div className="border-b border-border/50 px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Atomic Media
            </p>
            <h1 className="mt-0.5 font-studio text-xl font-medium text-foreground">
              Media Studio
            </h1>
          </div>
          <div className="rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
            Wan 2.2 · Local Worker
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-5">
        <div className="mx-auto grid w-full max-w-[1500px] gap-4 lg:grid-cols-[minmax(320px,0.82fr)_minmax(440px,1.45fr)]">
          <MediaGenerationForm
            disabled={generationBusy || workerState === 'offline'}
            onSubmit={handleSubmit}
          />

          <div className="flex min-h-0 flex-col gap-3">
            <MediaPreview job={job} />
            <MediaJobStatus
              workerState={workerState}
              workerHealth={workerHealth}
              job={job}
              error={error}
              onRetryWorker={refreshHealth}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
