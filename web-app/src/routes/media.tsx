import { createFileRoute } from '@tanstack/react-router'
import { route } from '@/constants/routes'
import { MediaStudio } from '@/containers/media/MediaStudio'

export const Route = createFileRoute(route.media as any)({
  component: MediaStudio,
})
