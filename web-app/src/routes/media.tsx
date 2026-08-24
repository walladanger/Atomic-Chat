import { createFileRoute } from '@tanstack/react-router'
import { route } from '@/constants/routes'

export const Route = createFileRoute(route.media as any)({
  component: MediaRoute,
})

function MediaRoute() {
  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-neutral-50 dark:bg-background">
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-5xl rounded-2xl border border-border/60 bg-background p-8 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Atomic Media
          </p>
          <h1 className="mt-2 font-studio text-2xl font-medium text-foreground">
            Media Studio
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Local image and video generation workspace. Worker controls and the
            approved generation interface are added in the next implementation
            slice.
          </p>
        </div>
      </div>
    </div>
  )
}
