import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatAgentModeSwitch } from './ChatAgentModeSwitch'

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

describe('ChatAgentModeSwitch', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders Chat, Agent, Media, and Code choices', () => {
    render(
      <ChatAgentModeSwitch
        isAgentMode={false}
        onChange={vi.fn()}
        chatLabel="Chat"
        agentLabel="Agent"
      />
    )

    expect(screen.getByRole('button', { name: 'Chat' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agent' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Media' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Code' })).toBeInTheDocument()
  })

  it('keeps Agent disabled independently from Media', () => {
    render(
      <ChatAgentModeSwitch
        isAgentMode={false}
        onChange={vi.fn()}
        chatLabel="Chat"
        agentLabel="Agent"
        agentDisabled
        agentDisabledTooltip="Local llama.cpp required"
      />
    )

    expect(screen.getByRole('button', { name: 'Agent' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Media' })).toBeEnabled()
  })

  it('navigates to Media without changing Agent mode', () => {
    const onChange = vi.fn()
    const onWorkspaceChange = vi.fn()
    render(
      <ChatAgentModeSwitch
        isAgentMode={false}
        onChange={onChange}
        onWorkspaceChange={onWorkspaceChange}
        chatLabel="Chat"
        agentLabel="Agent"
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Media' }))

    expect(onWorkspaceChange).toHaveBeenCalledWith('media')
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Agent' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  })

  it('navigates to Code without changing Agent mode', () => {
    const onChange = vi.fn()
    const onWorkspaceChange = vi.fn()
    render(
      <ChatAgentModeSwitch
        isAgentMode={false}
        onChange={onChange}
        onWorkspaceChange={onWorkspaceChange}
        chatLabel="Chat"
        agentLabel="Agent"
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Code' }))

    expect(onWorkspaceChange).toHaveBeenCalledWith('code')
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Agent' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  })

  it('marks Media active when the Media route is open', () => {
    render(
      <ChatAgentModeSwitch
        isAgentMode={false}
        onChange={vi.fn()}
        activeWorkspace="media"
        chatLabel="Chat"
        agentLabel="Agent"
      />
    )

    expect(screen.getByRole('button', { name: 'Media' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByRole('button', { name: 'Chat' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  })

  it('marks Code active when the Code route is open', () => {
    render(
      <ChatAgentModeSwitch
        isAgentMode={false}
        onChange={vi.fn()}
        activeWorkspace="code"
        chatLabel="Chat"
        agentLabel="Agent"
      />
    )

    expect(screen.getByRole('button', { name: 'Code' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByRole('button', { name: 'Chat' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  })
})
