/**
 * The media library, at /media/library.
 *
 * The filename is `media_.library.tsx`, not `media/library.tsx`. The trailing
 * underscore is TanStack Router's opt-out from the parent layout: written as
 * `media/library.tsx`, this route would nest inside `routes/media.tsx` and
 * render nothing unless that file grew an `<Outlet />`. `routes/media.tsx` is
 * one of the files frozen by the selective v2.0.32 protected surface, so
 * editing it would mean a guard re-baseline and the user's authorisation for a
 * change that buys nothing. The underscore gives the same URL and leaves the
 * protected file alone.
 */

import { createFileRoute, useNavigate } from '@tanstack/react-router'

import HeaderPage from '@/containers/HeaderPage'
import { MediaLibrary } from '@/containers/media/MediaLibrary'
import { route } from '@/constants/routes'
import { setPendingMediaReRun } from '@/services/media/rerun'

export const Route = createFileRoute('/media_/library')({
  component: MediaLibraryRoute,
})

function MediaLibraryRoute() {
  const navigate = useNavigate()

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto">
      <HeaderPage>
        <span>Library</span>
      </HeaderPage>
      <div className="p-4">
        <MediaLibrary
          onReRun={(request) => {
            // Handed over rather than executed here: the studio owns submission,
            // and duplicating that here would be a second code path to keep in
            // step with the first.
            setPendingMediaReRun(request)
            void navigate({ to: route.media })
          }}
        />
      </div>
    </div>
  )
}
