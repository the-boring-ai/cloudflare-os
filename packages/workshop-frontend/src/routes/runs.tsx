import { createFileRoute } from '@tanstack/react-router'
import { BilyRuns } from '../components/BilyOperations'
import { useDocumentTitle } from '../useDocumentTitle'

export const Route = createFileRoute('/runs')({ component: RunsPage })

function RunsPage() {
  useDocumentTitle('Runs')
  return <BilyRuns />
}
