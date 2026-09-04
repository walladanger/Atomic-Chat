import { useMemo } from 'react'
import { useAppState } from '@/hooks/useAppState'
import { useModelProvider } from '@/hooks/useModelProvider'
import { useModelStrategy } from '@/hooks/useModelStrategy'
import { buildModelRouteCandidates } from '@/services/model-router/provider-adapter'
import { modelRouteKey, routeModel } from '@/services/model-router/router'
import type {
  ModelRouteCandidate,
  ModelStrategy,
} from '@/services/model-router/types'

const STRATEGY_OPTIONS: Array<{ value: ModelStrategy; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'fast', label: 'Fast' },
  { value: 'best-local', label: 'Best Local' },
  { value: 'manual', label: 'Manual' },
]

type CodeWorkspaceViewProps = {
  candidates: ModelRouteCandidate[]
  strategy: ModelStrategy
  manualModelKey: string | null
  onStrategyChange: (strategy: ModelStrategy) => void
  onManualModelChange: (modelKey: string | null) => void
}

export function CodeWorkspaceView({
  candidates,
  strategy,
  manualModelKey,
  onStrategyChange,
  onManualModelChange,
}: CodeWorkspaceViewProps) {
  const decision = routeModel({
    strategy,
    candidates,
    manualModelKey,
    requiredCapabilities: ['coding'],
  })

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-neutral-50 dark:bg-background">
      <div className="border-b border-border/50 px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Atomic Code
            </p>
            <h1 className="mt-0.5 font-studio text-xl font-medium text-foreground">
              Code Workspace
            </h1>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Model strategy</span>
            <select
              aria-label="Model strategy"
              value={strategy}
              onChange={(event) =>
                onStrategyChange(event.target.value as ModelStrategy)
              }
              className="rounded-md border border-border/70 bg-background px-2.5 py-1.5 text-foreground shadow-sm outline-none focus:ring-2 focus:ring-ring"
            >
              {STRATEGY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-5">
        <div className="mx-auto grid w-full max-w-5xl gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
          <section className="rounded-xl border border-border/60 bg-background p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Coding harness
            </p>
            <h2 className="mt-2 text-lg font-medium text-foreground">
              Laptop-ready foundation
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Atomic Code can resolve a fast local model, fall back to a
              configured external provider, and prepare a stronger specialist
              when a task needs one. Repository tools, scoped edits, diffs, and
              command execution arrive in the next milestone.
            </p>

            {strategy === 'manual' && (
              <label className="mt-5 block text-xs font-medium text-muted-foreground">
                Manual model
                <select
                  aria-label="Manual model"
                  value={manualModelKey ?? ''}
                  onChange={(event) =>
                    onManualModelChange(event.target.value || null)
                  }
                  className="mt-1.5 block w-full rounded-md border border-border/70 bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Use Auto fallback</option>
                  {candidates.map((candidate) => {
                    const key = modelRouteKey(
                      candidate.providerId,
                      candidate.modelId
                    )
                    return (
                      <option key={key} value={key}>
                        {candidate.displayName ?? candidate.modelId} ·{' '}
                        {candidate.providerId}
                      </option>
                    )
                  })}
                </select>
              </label>
            )}
          </section>

          <aside className="space-y-3">
            <section className="rounded-xl border border-border/60 bg-background p-4 shadow-sm">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Primary model
              </p>
              {decision.primary ? (
                <>
                  <p className="mt-2 font-medium text-foreground">
                    {decision.primary.displayName ?? decision.primary.modelId}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {decision.primary.providerId} · {decision.primary.locality}
                    {decision.primary.availability === 'ready'
                      ? ' · running'
                      : ''}
                  </p>
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">
                    {decision.primaryReason}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-2 font-medium text-foreground">
                    No model available
                  </p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    Download a small local model or configure an external
                    provider. Code stays available while model routing is
                    offline.
                  </p>
                </>
              )}
              {decision.fallbackReason && (
                <p className="mt-3 rounded-md bg-muted px-2.5 py-2 text-xs text-muted-foreground">
                  {decision.fallbackReason}
                </p>
              )}
            </section>

            <section className="rounded-xl border border-border/60 bg-background p-4 shadow-sm">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Escalation
              </p>
              <p className="mt-2 text-sm text-foreground">
                {decision.escalation.status === 'available'
                  ? decision.escalation.model.displayName ??
                    decision.escalation.model.modelId
                  : 'Inactive'}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {decision.escalation.reason}
              </p>
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}

export function CodeWorkspace() {
  const providers = useModelProvider((state) => state.providers)
  const selectedProviderId = useModelProvider(
    (state) => state.selectedProvider
  )
  const selectedModelId = useModelProvider((state) => state.selectedModel?.id)
  const activeModelIds = useAppState((state) => state.activeModels)
  const strategy = useModelStrategy((state) => state.strategy)
  const manualModelKey = useModelStrategy((state) => state.manualModelKey)
  const setStrategy = useModelStrategy((state) => state.setStrategy)
  const setManualModelKey = useModelStrategy(
    (state) => state.setManualModelKey
  )

  const candidates = useMemo(
    () =>
      buildModelRouteCandidates({
        providers,
        activeModelIds,
        selectedProviderId,
        selectedModelId,
      }),
    [activeModelIds, providers, selectedModelId, selectedProviderId]
  )

  return (
    <CodeWorkspaceView
      candidates={candidates}
      strategy={strategy}
      manualModelKey={manualModelKey}
      onStrategyChange={setStrategy}
      onManualModelChange={setManualModelKey}
    />
  )
}
