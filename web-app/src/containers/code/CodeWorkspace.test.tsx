import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { CodeWorkspaceView } from './CodeWorkspace'
import type {
  ModelRouteCandidate,
  ModelStrategy,
} from '@/services/model-router/types'

const localCandidate: ModelRouteCandidate = {
  providerId: 'local-provider',
  modelId: 'small-code-model',
  displayName: 'Small Code Model',
  locality: 'local',
  availability: 'available',
  capabilities: ['general', 'coding'],
  parameterCountB: 4,
}

describe('CodeWorkspaceView', () => {
  it('renders the laptop-safe no-model state without blocking strategy control', () => {
    render(
      <CodeWorkspaceView
        candidates={[]}
        strategy="auto"
        manualModelKey={null}
        onStrategyChange={vi.fn()}
        onManualModelChange={vi.fn()}
      />
    )

    expect(screen.getByRole('heading', { name: 'Code Workspace' })).toBeInTheDocument()
    expect(screen.getByLabelText('Model strategy')).toBeEnabled()
    expect(screen.getByText('No model available')).toBeInTheDocument()
    expect(
      screen.getByText(/download a small local model or configure an external provider/i)
    ).toBeInTheDocument()
  })

  it('exposes Auto, Fast, Best Local, and Manual strategies', () => {
    render(
      <CodeWorkspaceView
        candidates={[localCandidate]}
        strategy="auto"
        manualModelKey={null}
        onStrategyChange={vi.fn()}
        onManualModelChange={vi.fn()}
      />
    )

    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Auto',
      'Fast',
      'Best Local',
      'Manual',
    ])
    expect(screen.getByText('Small Code Model')).toBeInTheDocument()
  })

  it('changes strategy and allows an exact model in Manual mode', () => {
    function StatefulCodeWorkspace() {
      const [strategy, setStrategy] = useState<ModelStrategy>('auto')
      const [manualModelKey, setManualModelKey] = useState<string | null>(null)

      return (
        <CodeWorkspaceView
          candidates={[localCandidate]}
          strategy={strategy}
          manualModelKey={manualModelKey}
          onStrategyChange={setStrategy}
          onManualModelChange={setManualModelKey}
        />
      )
    }

    render(<StatefulCodeWorkspace />)

    fireEvent.change(screen.getByLabelText('Model strategy'), {
      target: { value: 'manual' },
    })
    expect(screen.getByLabelText('Model strategy')).toHaveValue('manual')

    fireEvent.change(screen.getByLabelText('Manual model'), {
      target: { value: 'local-provider::small-code-model' },
    })
    expect(screen.getByLabelText('Manual model')).toHaveValue(
      'local-provider::small-code-model'
    )
  })
})
