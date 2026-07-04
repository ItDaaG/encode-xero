import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/auth_/connect')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/auth/connect"!</div>
}
