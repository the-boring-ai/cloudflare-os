// @vitest-environment jsdom
/* eslint-disable react/react-in-jsx-scope */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StoreCatalog } from './StoreCatalog'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const store = (key = 'alpha.myshopify.com') => ({
  key, name: key === 'alpha.myshopify.com' ? 'Alpha Store' : 'Beta Store', domain: key === 'alpha.myshopify.com' ? 'alpha.example' : 'beta.example', shopifyDomain: key,
  source: 'bily_and_attio', bily: { id: key, installed: false, archived: true, hasActivePlan: false }, attio: { personIds: ['person-exact'], companyIds: ['company-exact'], recordCount: 2 },
  contactEmail: 'owner@' + key.replace('.myshopify.com', '.example'), audit: { status: 'access_limited', publicUrl: 'https://audit.bily.ai/audit/alpha.example?workflow=audit_exact', capturedAt: '2026-10-28T00:00:00Z' },
  outreach: { cardId: 'card_0123456789abcdef01234567', reviewState: 'draft' },
})
const page = (stores = [store()], offset = 0, nextOffset: number | null = null) => ({
  summary: { totalStores: 2104, bilyStores: 1618, attioStores: 1804, attioStoreLinkedRecords: 2445, preparedDrafts: 27, installedStores: 100, formerStores: 1500, needsAudit: 2000 },
  sources: { bily: { complete: true, capturedAt: '2026-10-31T00:00:00Z', recordsRead: 1618 }, attio: { complete: true, capturedAt: '2026-10-31T00:00:00Z', recordsRead: 6123 } },
  stores, filteredTotal: 2104, offset, limit: 50, nextOffset,
})
const detail = (record = store(), relationship = 'Existing relationship evidence') => ({
  store: record,
  review: { relationship, nextAction: 'Check exact capture availability.', reasons: ['Current billing clearance is required.'], sequence: [{ step: 1, subject: 'A focused check', body: 'The review draft.' }, { step: 2, subject: 'A conditional next step', body: 'Conditional follow-up.' }], auditTakeaway: 'Storefront access was restricted.', auditLimitations: ['No tracking defect was established.'] },
})

describe('complete Bily store directory', () => {
  let root: Root | undefined
  let container: HTMLDivElement
  afterEach(async () => { await act(async () => root?.unmount()); container?.remove(); vi.unstubAllGlobals() })
  const mount = async (fetcher: (path: string, init?: RequestInit) => Promise<Response>) => {
    const mock = vi.fn<typeof fetcher>(fetcher); vi.stubGlobal('fetch', mock)
    container = document.createElement('div'); document.body.append(container); root = createRoot(container)
    await act(async () => root!.render(<StoreCatalog />))
    return mock
  }
  const click = async (label: string) => {
    const target = Array.from(container.querySelectorAll('button')).find(item => item.textContent?.trim() === label || item.getAttribute('aria-label') === label)
    expect(target).toBeDefined(); await act(async () => target!.click())
  }

  it('uses server pagination across the full catalog and keeps navigation read-only', async () => {
    const beta = store('beta.myshopify.com')
    const calls = await mount(async path => Response.json(path.includes('/stores?') ? path.includes('offset=50') ? page([beta], 50, null) : page([store()], 0, 50) : detail(path.includes('beta') ? beta : store())))
    expect(container.textContent).toContain('2,445 store-linked CRM records')
    expect(container.textContent).toContain('1–1 of 2,104 stores')
    expect(container.textContent).toContain('Access limited')
    expect(container.querySelector('a[href="/approvals?card=card_0123456789abcdef01234567"]')).not.toBeNull()
    await click('Next stores')
    expect(container.textContent).toContain('Beta Store')
    expect(container.textContent).not.toContain('Alpha Store')
    expect(container.textContent).toContain('51–51 of 2,104 stores')
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Next stores"]')?.disabled).toBe(true)
    await click('Previous stores')
    expect(container.textContent).toContain('Alpha Store')
    expect(calls.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true)
  })

  it('queries all stores on search and resets pagination for status filters', async () => {
    const calls = await mount(async path => Response.json(path.includes('/stores?') ? page([store()], path.includes('offset=50') ? 50 : 0, 50) : detail()))
    await click('Next stores')
    const select = container.querySelector<HTMLSelectElement>('select[aria-label="Store status"]')!
    await act(async () => { select.value = 'needs_audit'; select.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(calls.mock.calls.some(([path]) => path.includes('status=needs_audit') && path.includes('offset=0'))).toBe(true)
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Find any store"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'alpha.example')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(calls.mock.calls.some(([path]) => path.includes('q=alpha.example') && path.includes('offset=0'))).toBe(true)
  })

  it('does not replace the current relationship with a late detail response from another store', async () => {
    const alpha = store(), beta = store('beta.myshopify.com')
    let resolveAlpha: ((value: Response) => void) | undefined
    let alphaSignal: AbortSignal | null | undefined
    await mount(async (path, init) => {
      if (path.includes('/stores?')) return Response.json(page([alpha, beta]))
      if (path.includes('alpha')) { alphaSignal = init?.signal; return new Promise<Response>(resolve => { resolveAlpha = resolve }) }
      return Response.json(detail(beta, 'Beta current conversation'))
    })
    const betaButton = Array.from(container.querySelectorAll('button')).find(item => item.textContent?.includes('Beta Store'))!
    await act(async () => betaButton.click())
    expect(alphaSignal?.aborted).toBe(true)
    expect(container.textContent).toContain('Beta current conversation')
    await act(async () => resolveAlpha!(Response.json(detail(alpha, 'Alpha stale conversation'))))
    expect(container.textContent).toContain('Beta current conversation')
    expect(container.textContent).not.toContain('Alpha stale conversation')
  })

  it('clears stale store detail on a failed page and allows an explicit retry', async () => {
    let failed = false
    await mount(async path => {
      if (!path.includes('/stores?')) return Response.json(detail())
      if (path.includes('offset=50') && !failed) { failed = true; return Response.json({ message: 'Store inventory is unavailable.' }, { status: 503 }) }
      return Response.json(page([store()], 0, 50))
    })
    expect(container.textContent).toContain('Existing relationship evidence')
    await click('Next stores')
    expect(container.textContent).toContain('Store inventory is unavailable.')
    expect(container.textContent).not.toContain('Existing relationship evidence')
    await click('Refresh stores')
    expect(container.textContent).toContain('Existing relationship evidence')
    expect(container.textContent).not.toContain('Store inventory is unavailable.')
  })

  it('labels prepared-only cold prospects separately from the customer base', async () => {
    const prospect = { ...store(), source: 'prepared', bily: null, attio: null, contactEmail: null, prepared: { senderLane: 'cold' } }
    const catalog = { ...page(), stores: [prospect], summary: { ...page().summary, totalStores: 2105, customerBaseStores: 2104, preparedOnlyStores: 1 } }
    await mount(async path => Response.json(path.includes('/stores?') ? catalog : { ...detail(), store: prospect }))
    expect(container.textContent).toContain('Prepared prospect')
    expect(container.textContent).toContain('2,104 stores in Bily / Attio · 1 additional prepared prospects or relationships')
    expect(container.textContent).toContain('Current main contact needs verification')
    expect(container.textContent).not.toContain('Bily records an active plan')
  })
})
