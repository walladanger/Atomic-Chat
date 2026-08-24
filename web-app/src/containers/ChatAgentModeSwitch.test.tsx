import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatAgentModeSwitch } from './ChatAgentModeSwitch'

const navigate = vi.fn()
let pathname = '/'

vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ pathname }),
  useNavigate: () => navigate,
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

describe('ChatAgentModeSwitch', () => {
  beforeEach(() => {
    navigate.mockReset()
    pathname = '/'
  })

  it('renders Chat, Agent, and Media choices', () => {
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
    render(
      <ChatAgentModeSwitch
        isAgentMode={false}
        onChange={onChange}
        chatLabel="Chat"
        agentLabel="Agent"
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Media' }))

    expect(navigate).toHaveBeenCalledWith({ to: '/media' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('marks Media active when the Media route is open', () => {
    pathname = '/media'
    render(
      <ChatAgentModeSwitch
        isAgentMode={false}
        onChange={vi.fn()}
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
})
