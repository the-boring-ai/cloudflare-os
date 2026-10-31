// @vitest-environment jsdom
/* eslint-disable react/react-in-jsx-scope */
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BilyApprovals, BilyRuns } from './BilyOperations'

vi.mock('@tanstack/react-router', () => ({ Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a> }))
vi.mock('./OutreachDeck', () => ({ OutreachDeck: () => <p>Outreach card review</p> }))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const row = {
  key: 'example', name: 'Example store', domain: 'example.com', lane: 'reactivation',
  status: 'ready_for_review', reviewStatus: 'draft', contentHash: 'exact-hash', reasons: [],
  expiresAt: '2099-01-01T00:00:00Z', contact: { email: 'merchant@example.com' },
  audit: { capturedAt: '2026-10-26T00:00:00Z', confidence: 90, publicUrl: 'https://audit.bily.ai/example' },
  finding: { title: 'Audit finding', evidence: [{ description: 'Observed event proof' }] },
  sequence: [{ step: 1, day: 0, subject: 'Your tracking check', body: 'Here is the finding and an offer to help.' }],
}
const run = { id: 'gtm_test', preparedAt: '2026-10-26T00:00:00Z', policyVersion: 'test', sources: { attio: { complete: true, capturedAt: '2026-10-26T00:00:00Z' } }, summary: { totalStores: 1 } }
const catalog = { summary: { totalStores: 2104, bilyStores: 1618, attioStores: 1804, attioStoreLinkedRecords: 2445, preparedDrafts: 27, needsAudit: 2000 }, sources: {}, stores: [], filteredTotal: 2104, offset: 0, limit: 50, nextOffset: null }

describe('native Bily operations', () => {
  let root: Root | undefined
  let container: HTMLDivElement
  afterEach(async () => { await act(async () => root?.unmount()); container?.remove(); vi.unstubAllGlobals(); window.history.replaceState({}, '', '/') })
  const mount = async (view: ReactNode) => {
    container = document.createElement('div'); document.body.append(container); root = createRoot(container)
    await act(async () => root!.render(view))
  }
  const click = async (label: string) => {
    const target = Array.from(container.querySelectorAll('button')).find((item) => item.textContent?.trim() === label)
    expect(target).toBeDefined()
    await act(async () => target!.click())
  }
  const metric = (label: string) => Array.from(container.querySelectorAll('p')).find((item) => item.textContent?.trim() === label)?.nextElementSibling?.textContent

  it('opens the complete directory before prepared runs even from a sample batch URL', async () => {
    window.history.replaceState({}, '', '/approvals?batch=bily-gtm-20-20261028')
    const fetchMock = vi.fn<(path: string, options?: RequestInit) => Promise<Response>>(async () => Response.json(catalog))
    vi.stubGlobal('fetch', fetchMock)
    await mount(<BilyApprovals />)
    await click('Customer sequences')
    expect(metric('Unique stores')).toBe('2,104')
    expect(container.textContent).toContain('2,445 store-linked CRM records')
    expect(fetchMock.mock.calls.every(([path]) => String(path).startsWith('/api/gtm/stores?'))).toBe(true)
    expect(container.querySelector('select[aria-label="Prepared run"]')).toBeNull()
  })

  it('reviews the exact displayed content and updates aggregate counts immediately', async () => {
    const fetchMock = vi.fn<(path: string, options?: RequestInit) => Promise<Response>>(async (path) => {
      if (path.startsWith('/api/gtm/stores?')) return Response.json(catalog)
      if (path.endsWith('/review')) {
        return Response.json({ row: { ...row, reviewStatus: 'reviewed' } })
      }
      return Response.json(path.endsWith('/runs') ? { runs: [run], identity: { email: 'admin@bily.ai', isAdmin: true } } : { rows: [row], nextOffset: null })
    })
    vi.stubGlobal('fetch', fetchMock)
    await mount(<BilyApprovals />)
    await click('Customer sequences')
    await click('Prepared runs')
    expect(metric('Ready for review')).toBe('1')
    await click('Mark reviewed')
    const reviewRequest = fetchMock.mock.calls.find(([path]) => path.endsWith('/review'))
    expect(JSON.parse(String(reviewRequest?.[1]?.body))).toEqual({ storeKey: row.key, contentHash: row.contentHash, status: 'reviewed' })
    expect(metric('Ready for review')).toBe('0')
    expect(metric('Reviewed')).toBe('1')
    expect(container.textContent).toContain('Observed event proof')
    expect(container.querySelector('a[href="/api/gtm/runs/gtm_test/export"]')).not.toBeNull()
  })

  it('shows a readable queue to non-admins without offering review or import', async () => {
    vi.stubGlobal('fetch', vi.fn(async (path: string) => Response.json(path.startsWith('/api/gtm/stores?') ? catalog : path.endsWith('/runs') ? { runs: [run], identity: { email: 'reader@bily.ai', isAdmin: false } } : { rows: [row], nextOffset: null })))
    await mount(<BilyApprovals />)
    await click('Customer sequences')
    await click('Prepared runs')
    expect(container.textContent).toContain('merchant@example.com')
    expect(Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Mark reviewed')).toBeUndefined()
    expect(Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Import snapshot')?.disabled).toBe(true)
  })

  it('clears a previous queue when changing to a run whose evidence cannot load', async () => {
    const nextRun = { ...run, id: 'gtm_second' }
    vi.stubGlobal('fetch', vi.fn(async (path: string) => {
      if (path.startsWith('/api/gtm/stores?')) return Response.json(catalog)
      if (path.endsWith('/runs')) return Response.json({ runs: [run, nextRun], identity: { email: 'admin@bily.ai', isAdmin: true } })
      if (path.includes('gtm_second')) return Response.json({ message: 'Evidence unavailable' }, { status: 503 })
      return Response.json({ rows: [row], nextOffset: null })
    }))
    await mount(<BilyApprovals />)
    await click('Customer sequences')
    await click('Prepared runs')
    const select = container.querySelector<HTMLSelectElement>('select[aria-label="Prepared run"]')!
    await act(async () => { select.value = nextRun.id; select.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(container.textContent).toContain('Evidence unavailable')
    expect(container.textContent).not.toContain('merchant@example.com')
    expect(metric('Stores')).toBe('0')
  })

  it('reports an absent executor heartbeat and submits a bounded approval through the existing API', async () => {
    const job = { id: 'job_test', objective: 'Inspect the internal project only', scope_json: '{"project":"example"}', status: 'awaiting_approval', risk_class: 'internal_write', created_at: '2026-10-26T00:00:00Z', updated_at: '2026-10-26T00:00:00Z' }
    const fetchMock = vi.fn<(path: string, options?: RequestInit) => Promise<Response>>(async (path) => {
      if (path.endsWith('/health')) return Response.json({ enabled: true, lastHeartbeatAt: '2026-08-24T00:00:00Z', counts: { queued: 0, running: 0, attention: 1 }, identity: { email: 'admin@bily.ai', isAdmin: true } })
      if (path.endsWith('/approve')) {
        return Response.json({ job: { ...job, status: 'queued' } })
      }
      return Response.json(path.includes('?limit') ? { jobs: [job] } : { job, events: [] })
    })
    vi.stubGlobal('fetch', fetchMock)
    await mount(<BilyRuns />)
    expect(container.textContent).toContain('No recent executor heartbeat')
    expect(container.textContent).toContain('"project":"example"')
    await click('Approve internal run')
    const approvalRequest = fetchMock.mock.calls.find(([path]) => path.endsWith('/approve'))
    expect(approvalRequest?.[1]?.method).toBe('POST')
    expect(new Headers(approvalRequest?.[1]?.headers).get('Idempotency-Key')).toBeTruthy()
    expect(fetchMock.mock.calls.some(([path]) => path.endsWith('/control'))).toBe(false)
  })
})
