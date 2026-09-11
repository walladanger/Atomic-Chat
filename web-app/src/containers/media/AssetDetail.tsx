/**
 * One generated asset, and everything the app truthfully knows about it.
 *
 * The honesty rules here are the point of the component, not decoration:
 *
 *  - A seed that was never recorded renders as "not recorded", never as 0. A
 *    fabricated zero would make "run this again identically" quietly produce a
 *    different image, which is the exact failure decision D8 closed.
 *  - "Re-run" is only OFFERED when it can be honoured. For an asset generated
 *    before D8 landed, the seed is genuinely unrecoverable, so the button is
 *    absent rather than present-and-lying.
 *  - "Re-run with a new seed" DROPS the seed instead of picking one. The job
 *    manager resolves a blank seed (D8), so dropping it keeps exactly one place
 *    in the app responsible for choosing seeds.
 */

import { Button } from '@/components/ui/button'
import { useTranslation } from '@/i18n/react-i18next-compat'
import type { MediaAsset } from '@/services/media/assets'

/** What the studio needs to run a generation again. */
export type MediaReRunRequest = {
  provider_id: string
  model_id: string
  task: string
  params: Record<string, unknown>
}

type AssetDetailProps = {
  asset: MediaAsset
  onReRun?: (request: MediaReRunRequest) => void
  onDelete?: (assetId: string) => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function AssetDetail({ asset, onReRun, onDelete }: AssetDetailProps) {
  const { t } = useTranslation()
  const { provenance } = asset

  // Only what the app can stand behind. `resolved_seed` is set solely when the
  // seed was actually known - see materialize().
  const seedKnown = typeof provenance.resolved_seed === 'number'

  const baseRequest: MediaReRunRequest = {
    provider_id: provenance.provider_id,
    model_id: provenance.model_id,
    task: provenance.task,
    params: { ...provenance.params },
  }

  const handleReRun = () => onReRun?.(baseRequest)

  const handleReRunNewSeed = () => {
    const params = { ...provenance.params }
    // Dropped, not replaced. The manager resolves it, so the seed is chosen in
    // one place for every path into generation.
    delete params.seed
    onReRun?.({ ...baseRequest, params })
  }

  return (
    <div
      data-testid="media-asset-detail"
      className="flex flex-col gap-3 rounded-md border border-border/60 p-4"
    >
      <div className="space-y-1">
        <h2 className="font-medium text-foreground">
          {provenance.model_label}
        </h2>
        <p className="text-xs text-muted-foreground">
          {provenance.task} · {provenance.provider_id} ·{' '}
          {formatBytes(asset.bytes)}
        </p>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        <dt className="text-muted-foreground">
          {t('media:asset.prompt', { defaultValue: 'Prompt' })}
        </dt>
        <dd className="break-words">{String(provenance.params.prompt ?? '')}</dd>

        <dt className="text-muted-foreground">
          {t('media:asset.seed', { defaultValue: 'Seed' })}
        </dt>
        <dd>
          {seedKnown ? (
            String(provenance.resolved_seed)
          ) : (
            <span className="text-muted-foreground">
              {t('media:asset.seedUnknown', {
                defaultValue: 'not recorded (generated before the app tracked it)',
              })}
            </span>
          )}
        </dd>

        <dt className="text-muted-foreground">
          {t('media:asset.created', { defaultValue: 'Created' })}
        </dt>
        <dd>{new Date(asset.created_at).toLocaleString()}</dd>

        <dt className="text-muted-foreground">
          {t('media:asset.file', { defaultValue: 'File' })}
        </dt>
        <dd className="break-all">{asset.path}</dd>
      </dl>

      <div className="flex flex-wrap gap-2">
        {seedKnown && onReRun && (
          <Button size="sm" onClick={handleReRun}>
            {t('media:asset.reRun', { defaultValue: 'Re-run' })}
          </Button>
        )}
        {onReRun && (
          <Button size="sm" variant="link" onClick={handleReRunNewSeed}>
            {t('media:asset.reRunNewSeed', {
              defaultValue: 'Re-run with a new seed',
            })}
          </Button>
        )}
        {onDelete && (
          <Button
            size="sm"
            variant="link"
            onClick={() => onDelete(asset.asset_id)}
          >
            {t('media:asset.delete', { defaultValue: 'Delete' })}
          </Button>
        )}
      </div>
    </div>
  )
}
