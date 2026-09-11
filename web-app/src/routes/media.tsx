import { Link, createFileRoute } from '@tanstack/react-router'
import { MediaStudio } from '@/containers/media/MediaStudio'
import { route } from '@/constants/routes'

export const Route = createFileRoute('/media')({
  component: MediaWorkspace,
})

/**
 * The route owns the link because it owns the router. MediaStudio takes it as a
 * prop so the component stays renderable without a RouterProvider, which its
 * own test depends on.
 */
function MediaWorkspace() {
  return (
    <MediaStudio
      libraryLink={
        <Link to={route.media_library} className="underline underline-offset-4">
          Library
        </Link>
      }
    />
  )
}
