import { createFileRoute } from '@tanstack/react-router'
import { MediaStudio } from '@/containers/media/MediaStudio'

export const Route = createFileRoute('/media')({
  component: MediaStudio,
})
