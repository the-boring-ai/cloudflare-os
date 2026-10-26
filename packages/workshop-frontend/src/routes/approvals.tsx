import { createFileRoute } from '@tanstack/react-router'
import { BilyApprovals } from '../components/BilyOperations'
import { useDocumentTitle } from '../useDocumentTitle'

export const Route = createFileRoute('/approvals')({ component: ApprovalsPage })

function ApprovalsPage() {
  useDocumentTitle('Approvals')
  return <BilyApprovals />
}
