/**
 * Settings → Media: the models one provider exposes, and their install state.
 *
 * Reuses `components/ui/progress` rather than adding a new progress primitive,
 * per the plan's Task 12 Step 4.
 *
 * Install is offered only where the provider actually declares it. The contract
 * ties `features.install` to the presence of `adapter.install`, so a provider
 * that cannot install must not be given a button that would throw - this is
 * coupling C9, where the old surface assumed every provider behaved like the
 * bundled worker.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Card, CardItem } from '@/containers/Card'
import { useTranslation } from '@/i18n/react-i18next-compat'
import { createMediaAdapter } from '@/services/media/providerFactory'
import { useMediaProviderStore } from '@/stores/media-provider-store'
import type { MediaModelDescriptor } from '@/services/media/contract'

type InstallState =
  | { phase: 'idle' }
  | { phase: 'installing'; percent: number | null }
  | { phase: 'installed' }
  | { phase: 'failed'; detail: string }

function detailOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Percent complete, or null when the provider reports no total to divide by. */
function percentOf(received: number, total?: number): number | null {
  if (!total || total <= 0) return null
  return Math.min(100, Math.round((received / total) * 100))
}

export function ModelCatalog({ providerId }: { providerId: string }) {
  const { t } = useTranslation()
  const provider = useMediaProviderStore((state) =>
    state.providers.find((entry) => entry.id === providerId)
  )
  const capabilities = useMediaProviderStore(
    (state) => state.capabilities[providerId]
  )
  const refresh = useMediaProviderStore((state) => state.refresh)

  const [installs, setInstalls] = useState<Record<string, InstallState>>({})

  useEffect(() => {
    void refresh({ providerId })
  }, [providerId, refresh])

  const canInstall = capabilities?.features?.install === true
  const models = useMemo(() => capabilities?.models ?? [], [capabilities])

  const setState = useCallback((modelId: string, next: InstallState) => {
    setInstalls((current) => ({ ...current, [modelId]: next }))
  }, [])

  const handleInstall = useCallback(
    async (model: MediaModelDescriptor) => {
      if (!provider) return

      setState(model.id, { phase: 'installing', percent: null })
      try {
        const adapter = createMediaAdapter(provider)
        if (!adapter.install) {
          throw new Error(
            `Provider "${provider.label}" does not support installing models.`
          )
        }
        await adapter.install(model.id, ({ received, total }) => {
          setState(model.id, {
            phase: 'installing',
            percent: percentOf(received, total),
          })
        })
        // Optimistic, and deliberately not followed by a capabilities refresh:
        // the provider stays the source of truth and reconciles this on the
        // next refresh. Re-fetching here would race the provider's own
        // bookkeeping and could flip a just-installed model back to "Install".
        setState(model.id, { phase: 'installed' })
      } catch (error) {
        // Named, and left recoverable: the row returns to offering Install
        // rather than becoming a dead end (C9).
        setState(model.id, { phase: 'failed', detail: detailOf(error) })
      }
    },
    [provider, setState]
  )

  if (!provider) return null

  return (
    <Card
      title={t('media:models.cardTitle', {
        provider: provider.label,
        defaultValue: '{{provider}} models',
      })}
    >
      {models.length === 0 && (
        <CardItem
          title={t('media:models.emptyTitle', { defaultValue: 'No models' })}
          description={t('media:models.emptyDescription', {
            defaultValue:
              'This provider reported no models. Enable it and refresh, or check that it is running.',
          })}
        />
      )}

      {models.map((model) => {
        const state = installs[model.id] ?? { phase: 'idle' }
        const alreadyInstalled =
          state.phase === 'installed' || model.install?.installed === true
        const installable =
          canInstall && model.install?.installable === true && !alreadyInstalled

        return (
          <CardItem
            key={model.id}
            title={model.label}
            description={
              <span className="flex flex-col gap-1">
                <span>{model.local_id}</span>
                {state.phase === 'installing' && (
                  <span className="flex items-center gap-2">
                    <Progress
                      className="w-40"
                      value={state.percent ?? undefined}
                    />
                    {/*
                     * The percentage is spelled out as well as drawn. The bar
                     * itself now announces its value too (decision D16 fixed
                     * the shared primitive), but a visible number is still the
                     * kinder thing for a long download - a sighted user should
                     * not have to estimate from a bar's width.
                     */}
                    <span>
                      {state.percent === null
                        ? t('media:models.starting', { defaultValue: 'Starting' })
                        : t('media:models.percent', {
                            percent: state.percent,
                            defaultValue: '{{percent}}%',
                          })}
                    </span>
                  </span>
                )}
                {state.phase === 'failed' && (
                  <span className="text-destructive">{state.detail}</span>
                )}
              </span>
            }
            actions={
              alreadyInstalled ? (
                <span className="text-muted-foreground">
                  {t('media:models.installed', { defaultValue: 'Installed' })}
                </span>
              ) : state.phase === 'installing' ? (
                <span className="text-muted-foreground">
                  {t('media:models.installing', { defaultValue: 'Installing' })}
                </span>
              ) : installable ? (
                <Button size="sm" onClick={() => void handleInstall(model)}>
                  {t('media:models.install', { defaultValue: 'Install' })}
                </Button>
              ) : null
            }
          />
        )
      })}
    </Card>
  )
}
