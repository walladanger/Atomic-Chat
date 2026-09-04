import { beforeEach, describe, expect, it } from 'vitest'
import { useModelStrategy } from './useModelStrategy'

describe('useModelStrategy', () => {
  beforeEach(() => {
    useModelStrategy.setState({ strategy: 'auto', manualModelKey: null })
  })

  it('defaults to Auto', () => {
    expect(useModelStrategy.getState().strategy).toBe('auto')
  })

  it('updates strategy and manual model independently', () => {
    useModelStrategy.getState().setManualModelKey('provider::model')
    useModelStrategy.getState().setStrategy('manual')

    expect(useModelStrategy.getState()).toMatchObject({
      strategy: 'manual',
      manualModelKey: 'provider::model',
    })

    useModelStrategy.getState().setStrategy('fast')
    expect(useModelStrategy.getState().manualModelKey).toBe('provider::model')
  })
})
