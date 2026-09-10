/**
 * Settings → Media.
 *
 * Composes the two Task 12 containers: the provider list, and the model
 * catalogue for whichever provider is selected. Kept thin deliberately - the
 * behaviour lives in the containers so it can be tested without a router.
 */

import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

import HeaderPage from '@/containers/HeaderPage'
import SettingsMenu from '@/containers/SettingsMenu'
import { ModelCatalog } from '@/containers/media/ModelCatalog'
import { ProviderList } from '@/containers/media/ProviderList'
import { route } from '@/constants/routes'
import { useMediaProviderStore } from '@/stores/media-provider-store'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Route = createFileRoute(route.settings.media as any)({
  component: MediaSettings,
})

function MediaSettings() {
  const providers = useMediaProviderStore((state) => state.providers)
  const [selected, setSelected] = useState<string | null>(null)

  // Default to the first enabled provider rather than forcing a click before
  // anything is on screen.
  const activeId =
    selected ?? providers.find((provider) => provider.enabled)?.id ?? null

  return (
    <div className="flex h-full w-full">
      <SettingsMenu />
      <div className="flex h-full w-full flex-col overflow-y-auto">
        <HeaderPage>
          <span>Media</span>
        </HeaderPage>
        <div className="flex flex-col gap-4 p-4">
          <ProviderList />

          {providers.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {providers.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  className={
                    provider.id === activeId
                      ? 'rounded border border-primary px-2 py-1'
                      : 'rounded border border-transparent px-2 py-1'
                  }
                  onClick={() => setSelected(provider.id)}
                >
                  {provider.label}
                </button>
              ))}
            </div>
          )}

          {activeId && <ModelCatalog providerId={activeId} />}
        </div>
      </div>
    </div>
  )
}
