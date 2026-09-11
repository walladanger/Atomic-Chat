/**
 * Provider health and the current job.
 *
 * Two things changed in the refit. First, health is now PER PROVIDER: the v1
 * version reported one global "worker" state, which stops describing reality
 * the moment a second provider exists - one being offline says nothing about
 * the others.
 *
 * Second, Cancel is gated on what the provider can actually do. The v1 cancel
 * cleared a local polling timer and never told the worker anything (coupling
 * C11), so the generation carried on burning GPU while the UI claimed it had
 * stopped. A button that cannot do what it says is worse than no button, so it
 * is rendered only when the provider reports `features.cancel` AND the adapter
 * implements it - which is exactly what the job manager's `cancellable` means.
 */
import { cn } from '@/lib/utils'
import { isTerminalMediaJobState } from '@/services/media/jobManager'
import { useTranslation } from '@/i18n/react-i18next-compat'
import type {
  MediaJobSnapshot,
  MediaProviderDescriptor,
  MediaProviderHealth,
} from '@/services/media/contract'

type MediaJobStatusProps = {
  job: MediaJobSnapshot | null
  /** The provider reports it can cancel this job, and implements it. */
  cancellable: boolean
  onCancel: (clientJobId: string) => void | Promise<unknown>
  providers: MediaProviderDescriptor[]
  health: Record<string, MediaProviderHealth>
  errors: Record<string, string | null>
  onRetryProvider: (providerId: string) => void | Promise<unknown>
}

function dotClass(state: MediaProviderHealth['state'] | undefined): string {
  if (state === 'online') return 'bg-emerald-500'
  if (state === 'checking') return 'bg-amber-400'
  if (state === 'unauthorised') return 'bg-amber-500'
  return 'bg-red-500'
}

type Translate = (key: string, options?: Record<string, unknown>) => string

function healthText(
  health: MediaProviderHealth | undefined,
  t: Translate
): string {
  if (!health) return t('media:status.notChecked', { defaultValue: 'Not checked' })
  if (health.state === 'online') {
    return health.version
      ? t('media:status.onlineVersion', {
          version: health.version,
          defaultValue: 'Online · v{{version}}',
        })
      : t('media:status.online', { defaultValue: 'Online' })
  }
  if (health.state === 'checking')
    return t('media:status.checking', { defaultValue: 'Checking…' })
  if (health.state === 'unauthorised')
    return t('media:status.needsKey', { defaultValue: 'Needs a key' })
  return health.detail
    ? t('media:status.offlineDetail', {
        detail: health.detail,
        defaultValue: 'Offline · {{detail}}',
      })
    : t('media:status.offline', { defaultValue: 'Offline' })
}

export function MediaJobStatus({
  job,
  cancellable,
  onCancel,
  providers,
  health,
  errors,
  onRetryProvider,
}: MediaJobStatusProps) {
  const { t } = useTranslation()
  const progress = Math.max(0, Math.min(100, Number(job?.progress ?? 0)))
  const running = job ? !isTerminalMediaJobState(job.state) : false

  return (
    <div className="rounded-xl border border-border/60 bg-background p-4 shadow-sm">
      <p className="text-xs font-semibold text-foreground">
        {t('media:status.providers', { defaultValue: 'Providers' })}
      </p>

      <ul className="mt-2 flex flex-col gap-1.5">
        {providers.map((provider) => {
          const entry = health[provider.id]
          const offline = entry?.state !== 'online' && entry?.state !== 'checking'

          return (
            <li
              key={provider.id}
              className="flex flex-wrap items-center justify-between gap-2 text-xs"
            >
              <span className="flex items-center gap-2 text-muted-foreground">
                <span
                  className={cn('size-2 rounded-full', dotClass(entry?.state))}
                />
                <span className="font-medium text-foreground">
                  {provider.label}
                </span>
                <span>{healthText(entry, t)}</span>
              </span>

              {offline && (
                <button
                  type="button"
                  onClick={() => void onRetryProvider(provider.id)}
                  className="rounded-lg border border-border/70 px-2.5 py-1 text-[11px] font-medium text-foreground transition hover:bg-muted"
                >
                  Retry
                </button>
              )}
            </li>
          )
        })}
      </ul>

      {job && (
        <div className="mt-4 border-t border-border/50 pt-3">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-medium capitalize text-foreground">
              {job.state}
            </span>
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground">{progress}%</span>
              {cancellable && running && (
                <button
                  type="button"
                  onClick={() => void onCancel(job.client_job_id)}
                  className="rounded-lg border border-border/70 px-2.5 py-1 text-[11px] font-medium text-foreground transition hover:bg-muted"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>

          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-foreground/70 transition-[width]"
              style={{
                width: `${job.state === 'succeeded' ? 100 : progress}%`,
              }}
            />
          </div>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span>Job {job.client_job_id}</span>
            {job.queue_position != null && (
              <span>Queue position {job.queue_position}</span>
            )}
            {job.error && <span className="text-red-500">{job.error.message}</span>}
          </div>
        </div>
      )}

      {Object.entries(errors)
        .filter(([, detail]) => Boolean(detail))
        .map(([providerId, detail]) => (
          <div
            key={providerId}
            className="mt-3 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-600 dark:text-red-400"
          >
            {detail}
          </div>
        ))}
    </div>
  )
}
