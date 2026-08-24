import type { AtomicMediaHealth, AtomicMediaJobSnapshot } from '@/services/atomicMedia/types'
import type { AtomicMediaWorkerState } from '@/hooks/useAtomicMediaJob'
import { cn } from '@/lib/utils'

type MediaJobStatusProps = {
  workerState: AtomicMediaWorkerState
  workerHealth: AtomicMediaHealth | null
  job: AtomicMediaJobSnapshot | null
  error: string | null
  onRetryWorker: () => void | Promise<unknown>
}

export function MediaJobStatus({
  workerState,
  workerHealth,
  job,
  error,
  onRetryWorker,
}: MediaJobStatusProps) {
  const progress = Math.max(0, Math.min(100, Number(job?.progress ?? 0)))
  const workerOnline = workerState === 'online'

  return (
    <div className="rounded-xl border border-border/60 bg-background p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-foreground">Current job</p>
          <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span
              className={cn(
                'size-2 rounded-full',
                workerOnline
                  ? 'bg-emerald-500'
                  : workerState === 'checking'
                    ? 'bg-amber-400'
                    : 'bg-red-500'
              )}
            />
            {workerOnline
              ? `Worker online${workerHealth?.version ? ` · v${workerHealth.version}` : ''}`
              : workerState === 'checking'
                ? 'Checking worker…'
                : 'Worker offline'}
          </div>
        </div>

        {!workerOnline && workerState !== 'checking' && (
          <button
            type="button"
            onClick={() => void onRetryWorker()}
            className="rounded-lg border border-border/70 px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted"
          >
            Retry worker
          </button>
        )}
      </div>

      {job && (
        <div className="mt-4 border-t border-border/50 pt-3">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-medium capitalize text-foreground">
              {job.status}
            </span>
            <span className="text-muted-foreground">{progress}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-foreground/70 transition-[width]"
              style={{ width: `${job.status === 'succeeded' ? 100 : progress}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span>Job {job.job_id}</span>
            {job.selected_device && <span>{job.selected_device}</span>}
            {job.queue_position != null && (
              <span>Queue position {job.queue_position}</span>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}
    </div>
  )
}
