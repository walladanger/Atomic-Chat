import { createFileRoute } from '@tanstack/react-router'
import { CodeWorkspace } from '@/containers/code/CodeWorkspace'

export const Route = createFileRoute('/code')({
  component: CodeWorkspace,
})
