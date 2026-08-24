import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WindowControls } from '../WindowControls'

const minimize = vi.fn()
const toggleMaximize = vi.fn()
const close = vi.fn()
const isMaximized = vi.fn()
const onResized = vi.fn()

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: () => ({
    minimize,
    toggleMaximize,
    close,
    isMaximized,
    onResized,
  }),
}))

vi.mock('@/lib/tauriEvent', () => ({
  createSafeUnlisten: (unlisten: () => void | Promise<void>) => async () => {
    await unlisten()
  },
}))

describe('WindowControls', () => {
  beforeEach(() => {
    minimize.mockReset().mockResolvedValue(undefined)
    toggleMaximize.mockReset().mockResolvedValue(undefined)
    close.mockReset().mockResolvedValue(undefined)
    isMaximized.mockReset().mockResolvedValue(false)
    onResized.mockReset().mockResolvedValue(vi.fn())
  })

  it('keeps native minimize, maximize, and close actions wired', async () => {
    render(<WindowControls />)

    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }))
    fireEvent.click(screen.getByRole('button', { name: 'Maximize' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    await waitFor(() => {
      expect(minimize).toHaveBeenCalledTimes(1)
      expect(toggleMaximize).toHaveBeenCalledTimes(1)
      expect(close).toHaveBeenCalledTimes(1)
    })
  })

  it('refreshes maximized state when the Tauri window resizes', async () => {
    let resizeHandler: (() => void) | undefined
    onResized.mockImplementation(async (handler: () => void) => {
      resizeHandler = handler
      return vi.fn()
    })
    isMaximized.mockResolvedValueOnce(false).mockResolvedValueOnce(true)

    render(<WindowControls />)
    await waitFor(() => expect(onResized).toHaveBeenCalled())

    resizeHandler?.()
    await waitFor(() => expect(isMaximized).toHaveBeenCalledTimes(2))
  })
})
