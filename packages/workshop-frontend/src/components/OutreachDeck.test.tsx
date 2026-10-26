// @vitest-environment jsdom
/* eslint-disable react/react-in-jsx-scope */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OutreachDeck } from './OutreachDeck'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const example = (id = 'card_one') => ({
  id, name: id === 'card_one' ? 'Example Shop' : 'Second Shop', domain: 'example.com', recipient: 'owner@example.com',
  contentHash: 'reviewed-content-hash', revision: 1, reviewState: 'draft', serviceReview: false, refreshRequested: false,
  gates: ['Current authoritative billing clearance is required.'], checkedAt: null, outbox: null,
  context: 'The merchant previously asked for a controlled test.', priority: 'Continue the existing conversation', path: 'Warm technical re-entry',
  nextAction: 'Confirm the test owner.', signature: 'Philippe\nBily\nReply stop to opt out.',
  attio: { personId: 'person-id', shopifyDomain: 'example.myshopify.com', contactConfidence: 'High' },
  audit: { completedAt: '2026-07-27T00:00:00Z', takeaway: 'Historical observation requiring a new check.' },
  steps: [{ step: 1, subject: 'A useful tracking check', body: 'Would a refreshed comparison help?', trigger: 'Human approval' }, { step: 2, subject: 'Next step', body: 'Conditional follow-up', trigger: 'Only after a new review.' }],
})

describe('outreach card review', () => {
  let root: Root | undefined
  let container: HTMLDivElement
  afterEach(async () => { await act(async () => root?.unmount()); container?.remove(); vi.unstubAllGlobals() })
  const button = (name: string) => Array.from(container.querySelectorAll('button')).find(item => item.textContent?.trim() === name)!
  const click = async (name: string) => { expect(button(name)).toBeDefined(); await act(async () => button(name).click()) }
  const mount = async (cards = [example(), example('card_two')], admin = true) => {
    const fetchMock = vi.fn<(path: string, options?: RequestInit) => Promise<Response>>(async (path, options) => {
      if (options?.method === 'POST') {
        const input = JSON.parse(String(options.body)), card = cards.find(item => path.includes(item.id))!
        if (path.endsWith('/action')) card.reviewState = ({ approve: 'approved', skip: 'skipped', hold: 'held', restore: 'draft' } as Record<string, string>)[input.action]
        return Response.json({ card })
      }
      return Response.json({ cards, identity: { email: 'philippe@bily.ai', isAdmin: admin }, sender: { enabled: true, dailyLimit: 20, lastHeartbeatAt: new Date().toISOString() } })
    })
    vi.stubGlobal('fetch', fetchMock)
    container = document.createElement('div'); document.body.append(container); root = createRoot(container)
    await act(async () => root!.render(<OutreachDeck />))
    return fetchMock
  }

  it('approves only the displayed first email and immediately advances to the next store', async () => {
    const calls = await mount()
    expect(container.textContent).toContain('A useful tracking check')
    expect(container.textContent).toContain('The merchant previously asked')
    await click('Approve & queue')
    const request = calls.mock.calls.find(([, options]) => options?.method === 'POST')!
    expect(request[0]).toBe('/api/gtm/outreach/card_one/action')
    expect(JSON.parse(String(request[1]?.body))).toEqual({ contentHash: 'reviewed-content-hash', action: 'approve' })
    expect(container.querySelector('article')?.getAttribute('aria-label')).toBe('Second Shop outreach card')
    expect(container.textContent).toContain('It will send automatically after the final checks pass.')
    expect(container.textContent).not.toContain('Email sent')
  })

  it('does not approve a follow-up preview and keeps normal text editing keys independent of swipes', async () => {
    const calls = await mount()
    await click('Follow-up 1')
    expect(button('Approve & queue').disabled).toBe(true)
    await click('Edit')
    const body = container.querySelector('textarea')!
    await act(async () => body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
    expect(calls.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0)
  })

  it('skips with the keyboard and lets the operator withdraw the decision', async () => {
    const calls = await mount()
    await act(async () => container.querySelector('article')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })))
    expect(container.querySelector('article')?.getAttribute('aria-label')).toBe('Second Shop outreach card')
    await click('Undo review')
    expect(container.querySelector('article')?.getAttribute('aria-label')).toBe('Example Shop outreach card')
    expect(calls.mock.calls.filter(([, options]) => options?.method === 'POST').map(([, options]) => JSON.parse(String(options?.body)).action)).toEqual(['skip', 'restore'])
  })

  it('shows service holds and billing blockers without misrepresenting approval as a send', async () => {
    await mount([{ ...example(), serviceReview: true }])
    expect(container.textContent).toContain('Service first')
    await click('Send checks · 1')
    expect(container.textContent).toContain('Current authoritative billing clearance is required.')
    await click('Hold')
    expect(container.textContent).toContain('Held. Automatic sending for this store is stopped.')
  })

  it('offers a read-only view to a non-admin', async () => {
    const calls = await mount([example()], false)
    expect(container.textContent).toContain('owner@example.com')
    expect(button('Approve & queue')).toBeUndefined()
    await act(async () => container.querySelector('article')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
    expect(calls.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0)
  })
})
