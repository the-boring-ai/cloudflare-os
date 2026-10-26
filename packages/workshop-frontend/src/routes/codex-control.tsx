import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/codex-control')({
  beforeLoad: () => { throw redirect({ to: '/runs', replace: true }) },
})
