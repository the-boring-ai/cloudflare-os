import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/gtm')({
  beforeLoad: () => { throw redirect({ to: '/approvals', replace: true }) },
})
