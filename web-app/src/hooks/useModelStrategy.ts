import { localStorageKey } from '@/constants/localStorage'
import type { ModelStrategy } from '@/services/model-router/types'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

type ModelStrategyState = {
  strategy: ModelStrategy
  manualModelKey: string | null
  setStrategy: (strategy: ModelStrategy) => void
  setManualModelKey: (manualModelKey: string | null) => void
}

export const useModelStrategy = create<ModelStrategyState>()(
  persist(
    (set) => ({
      strategy: 'auto',
      manualModelKey: null,
      setStrategy: (strategy) => set({ strategy }),
      setManualModelKey: (manualModelKey) => set({ manualModelKey }),
    }),
    {
      name: localStorageKey.modelStrategy,
      storage: createJSONStorage(() => localStorage),
    }
  )
)
