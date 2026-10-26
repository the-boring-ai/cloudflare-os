import { createFileRoute } from '@tanstack/react-router'
import { BilyEmail } from '../components/BilyEmail'
import { useDocumentTitle } from '../useDocumentTitle'

export const Route = createFileRoute('/email')({
  validateSearch: (search: Record<string, unknown>) => ({
    run: typeof search.run === 'string' ? search.run : '',
    store: typeof search.store === 'string' ? search.store : '',
    hash: typeof search.hash === 'string' ? search.hash : '',
  }),
  component: EmailPage,
})

function EmailPage() {
  useDocumentTitle('Email')
  return <BilyEmail selection={Route.useSearch()} />
}
