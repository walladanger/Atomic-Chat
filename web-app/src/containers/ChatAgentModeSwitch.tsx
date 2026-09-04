import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

type RoutedWorkspace = 'media' | 'code'

type ChatAgentModeSwitchProps = {
  isAgentMode: boolean
  onChange: (isAgentMode: boolean) => void
  chatLabel: string
  agentLabel: string
  mediaLabel?: string
  codeLabel?: string
  activeWorkspace?: RoutedWorkspace
  onWorkspaceChange?: (workspace: RoutedWorkspace) => void
  agentDisabled?: boolean
  agentDisabledTooltip?: string
  showAgentAttention?: boolean
}

type WorkspaceMode = 'chat' | 'agent' | 'media' | 'code'

export function canSelectChatAgentMode(
  initialMessage: boolean | undefined,
  projectId: string | undefined
): boolean {
  return Boolean(initialMessage && !projectId)
}

export function ChatAgentModeSwitch({
  isAgentMode,
  onChange,
  chatLabel,
  agentLabel,
  mediaLabel = 'Media',
  codeLabel = 'Code',
  activeWorkspace,
  onWorkspaceChange,
  agentDisabled = false,
  agentDisabledTooltip,
  showAgentAttention = false,
}: ChatAgentModeSwitchProps) {
  const activeMode: WorkspaceMode =
    activeWorkspace ?? (isAgentMode ? 'agent' : 'chat')

  const selectMode = (mode: WorkspaceMode) => {
    if (mode === 'media' || mode === 'code') {
      onWorkspaceChange?.(mode)
      return
    }
    onChange(mode === 'agent')
  }

  return (
    <div
      className="flex w-full items-center rounded-lg border border-border/60 bg-muted/80 p-0.5"
      role="group"
      aria-label={`${chatLabel} / ${agentLabel} / ${mediaLabel} / ${codeLabel}`}
    >
      {[
        { label: chatLabel, value: 'chat' as const },
        { label: agentLabel, value: 'agent' as const },
        { label: mediaLabel, value: 'media' as const },
        { label: codeLabel, value: 'code' as const },
      ].map((mode) => {
        const isActive = activeMode === mode.value
        const isAgentChoice = mode.value === 'agent'
        const isDisabled = isAgentChoice && agentDisabled

        const button = (
          <button
            key={mode.label}
            type="button"
            aria-pressed={isActive}
            disabled={isDisabled}
            onClick={() => selectMode(mode.value)}
            className={cn(
              'relative flex-1 cursor-pointer rounded-md px-3 py-0.5 text-xs font-medium text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isActive &&
                'bg-background text-foreground shadow-sm ring-1 ring-border/70 dark:bg-secondary',
              isDisabled && 'cursor-not-allowed opacity-50'
            )}
          >
            {mode.label}
            {isAgentChoice && showAgentAttention && (
              <span
                data-testid="agent-mode-attention-dot"
                aria-hidden="true"
                className="absolute right-2 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-blue-500"
              />
            )}
          </button>
        )

        if (!isDisabled || !agentDisabledTooltip) return button

        return (
          <Tooltip key={mode.label}>
            <TooltipTrigger asChild>
              <span
                className="inline-flex flex-1 cursor-not-allowed"
                title={agentDisabledTooltip}
              >
                {button}
              </span>
            </TooltipTrigger>
            <TooltipContent>{agentDisabledTooltip}</TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}
