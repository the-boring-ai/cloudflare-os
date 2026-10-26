// @vitest-environment jsdom
/* eslint-disable react/react-in-jsx-scope */
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { BilyEmail } from './BilyEmail'
vi.mock('@tanstack/react-router', () => ({ Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a> }))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root | undefined
let container: HTMLDivElement
afterEach(async () => { await act(async () => root?.unmount()); container?.remove(); vi.unstubAllGlobals() })
const status = { identity: { isAdmin: true }, senderTransport: 'codex', paused: true, dailyTarget: 1500, localRollingUsage: 0, blockers: ['source_executor_handover_required', 'google_oauth_not_configured'], senders: [], counts: [], deliveries: [], events: [], sourceRefresh: { automatic: false, maxAgeMinutes: 5, sources: {} } }
async function mount(selection = { run: '', store: '', hash: '' }, lane?: 'cold') {
  const fetchMock = vi.fn(async (path: string) => Response.json(path === '/api/outbound/status' ? status : { cards: [{ id: 'card-1', contentHash: 'hash-1', senderLane: lane, recipient: 'owner@example.com', signature: 'Philippe · Bily · Reply stop.', attio: { personId: 'person-1' }, reviewState: 'approved', steps: [{ step: 1, subject: 'The reviewed audit finding', body: 'Here is the exact reviewed email.' }], outbox: { id: 'outbox-1', approval_expires_at: '2099-01-01T00:00:00Z', dispatch_fence_at: null } }] }))
  vi.stubGlobal('fetch', fetchMock); container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  await act(async () => root!.render(<BilyEmail selection={selection} />)); return fetchMock
}
it('shows incomplete setup and preserves the existing executor without starting delivery on load', async () => {
  const fetchMock = await mount()
  expect(container.textContent).toContain('existing Codex outreach workflow')
  expect(container.textContent).toContain('Verify source refresh before switching')
  const start = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Start Workspace'))
  expect(start?.disabled).toBe(true); expect(fetchMock).toHaveBeenCalledTimes(1)
})
it('shows the exact approved card and offers a verified customer relationship only for a warm recipient', async () => {
  await mount({ run: 'outbox-1', store: 'card-1', hash: 'hash-1' })
  expect(container.textContent).toContain('Here is the exact reviewed email.')
  expect(container.textContent).toContain('Philippe · Bily · Reply stop.')
  expect(container.querySelector('select')?.value).toBe('existing_customer_relationship')
  const enroll = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Enroll first email'))
  expect(enroll?.disabled).toBe(true)
})
it('cold prospect contact cannot select the customer relationship basis', async () => {
  await mount({ run: 'outbox-1', store: 'card-1', hash: 'hash-1' }, 'cold')
  expect(container.querySelector('select')?.value).toBe('explicit_permission')
  expect(container.querySelector('option[value="existing_customer_relationship"]')).toBeNull()
})
