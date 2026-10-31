import { useEffect, useState } from 'react'
import { ArrowClockwise, ArrowUpRight, ArrowLeft, ArrowRight } from '@phosphor-icons/react'
import { RelationshipBrief, type ReviewBrief } from './RelationshipBrief'

const button = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-kumo-line px-3 py-2 text-sm text-kumo-default hover:bg-kumo-tint disabled:cursor-default disabled:opacity-50'
const field = 'min-h-10 rounded-lg border border-kumo-line bg-kumo-base px-3 py-2 text-sm text-kumo-default'
const date = (value?: string | null) => value ? new Date(value).toLocaleString() : 'Not recorded'
const count = (value?: number) => (value ?? 0).toLocaleString()
const words = (value: string) => value.replaceAll('_', ' ')
type CatalogSource = { complete: boolean; capturedAt: string; recordsRead: number }
type Store = {
  key: string; name: string; domain: string; shopifyDomain: string | null; source: 'bily' | 'attio' | 'bily_and_attio' | 'prepared'
  bily: { id: string; installed: boolean | null; archived: boolean | null; hasActivePlan: boolean | null } | null
  attio: { personIds: string[]; companyIds: string[]; recordCount: number } | null
  contactEmail: string | null
  audit: { status: string; publicUrl: string | null; capturedAt: string | null } | null
  outreach: { cardId: string; reviewState: string } | null
  prepared?: { senderLane: 'cold' | 'warm' }
}
type CatalogPage = {
  summary: { totalStores: number; customerBaseStores?: number; preparedOnlyStores?: number; bilyStores: number; attioStores: number; attioStoreLinkedRecords: number; preparedDrafts: number; installedStores: number; formerStores: number; needsAudit: number }
  sources: { bily?: CatalogSource; attio?: CatalogSource; preparation?: CatalogSource }
  stores: Store[]; filteredTotal: number; offset: number; limit: number; nextOffset: number | null
}
type StoreDetail = { store: Store; review: { relationship: string | null; nextAction: string | null; reasons: string[]; sequence: { step: number; subject: string; body: string }[]; auditTakeaway: string | null; auditLimitations: string[]; reviewBrief?: ReviewBrief } | null }

const lifecycle = (store: Store) => store.bily?.installed === true ? 'Installed' : store.bily?.installed === false ? 'Uninstalled' : store.bily?.archived === true ? 'Archived' : 'Needs verification'
const sourceLabel = (store: Store) => store.source === 'prepared' ? store.prepared?.senderLane === 'cold' ? 'Prepared prospect' : 'Prepared relationship' : store.source === 'bily_and_attio' ? 'Bily and Attio' : store.source === 'bily' ? 'Bily' : 'Attio'
const auditStates: Record<string, string> = { available: 'Report available', access_limited: 'Access limited', needs_review: 'Needs review', not_run: 'Not audited' }
const auditLabel = (store: Store) => auditStates[store.audit?.status ?? 'not_run'] ?? words(store.audit?.status ?? 'not_run')

async function get<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', signal })
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Your Bily session needs refreshing. Sign in again, then retry.')
  const body = await response.json()
  if (!response.ok) throw new Error(body.message || `The store directory could not load (${response.status}).`)
  return body as T
}

/** Complete store inventory, independent of preparation batches and sending eligibility. */
export function StoreCatalog() {
  const [page, setPage] = useState<CatalogPage | null>(null)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState('')
  const [detail, setDetail] = useState<StoreDetail | null>(null)
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const [detailError, setDetailError] = useState('')
  const [revision, setRevision] = useState(0)
  const row = page?.stores.find(store => store.key === selected)
  const review = detail?.store.key === row?.key ? detail?.review : null
  const email = review?.sequence[step]

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError(''); setPage(null); setDetail(null); setSelected('')
    const params = new URLSearchParams({ q: search, status: filter, limit: '50', offset: String(offset) })
    void get<CatalogPage>('/api/gtm/stores?' + params, controller.signal).then(next => {
      if (controller.signal.aborted) return
      setPage(next); setSelected(next.stores[0]?.key ?? ''); setStep(0)
    }).catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'The store directory could not load.') }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [search, filter, offset, revision])

  useEffect(() => {
    setDetail(null); setDetailError(''); setStep(0)
    if (!selected) { setDetailLoading(false); return }
    const controller = new AbortController()
    setDetailLoading(true)
    void get<StoreDetail>('/api/gtm/stores/' + encodeURIComponent(selected), controller.signal).then(next => {
      if (!controller.signal.aborted && next.store.key === selected) setDetail(next)
    }).catch(err => { if (!controller.signal.aborted) setDetailError(err instanceof Error ? err.message : 'The store details could not load.') }).finally(() => { if (!controller.signal.aborted) setDetailLoading(false) })
    return () => controller.abort()
  }, [selected, revision])

  return <section aria-label="All Bily stores">
    <div className="mt-5 flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-medium text-kumo-default">All stores</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-kumo-subtle">The full store directory, including stores without an audit or draft. Store records are joined by exact identity; multiple CRM contacts can belong to one store.</p></div>
      <button className={button} disabled={loading} onClick={() => setRevision(value => value + 1)}><ArrowClockwise size={15} /> Refresh stores</button>
    </div>
    {error && <p role="alert" className="my-4 rounded-lg border border-kumo-line p-3 text-sm text-kumo-danger">{error}</p>}
    <div className="mt-5 grid grid-cols-2 border-y border-kumo-line sm:grid-cols-4">
      {([['Unique stores', page?.summary.totalStores], ['In Bily', page?.summary.bilyStores], ['Linked in Attio', page?.summary.attioStores], ['With outreach drafts', page?.summary.preparedDrafts]] as const).map(([label, value]) => <div key={label} className="py-4"><p className="text-xs text-kumo-subtle">{label}</p><p className="mt-2 text-2xl text-kumo-default">{loading ? '…' : page ? count(value) : '—'}</p></div>)}
    </div>
    {page && <div className="flex flex-wrap gap-x-5 gap-y-2 border-b border-kumo-line py-3 text-xs leading-5 text-kumo-subtle">
      {Object.entries(page.sources).map(([name, source]) => <span key={name}>{name === 'bily' ? 'Bily' : name === 'preparation' ? 'Prepared cards' : 'Attio'} · {source.complete ? 'Captured' : 'Incomplete read'} {date(source.capturedAt)}</span>)}
      <span>{count(page.summary.attioStoreLinkedRecords)} store-linked CRM records · {count(page.summary.needsAudit)} stores need audit evidence</span>
      {page.summary.customerBaseStores !== undefined && <span>{count(page.summary.customerBaseStores)} stores in Bily / Attio · {count(page.summary.preparedOnlyStores)} additional prepared prospects or relationships</span>}
    </div>}
    <form className="my-4 flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); setSearch(query.trim()); setOffset(0) }}>
      <input className={`${field} min-w-44 flex-1`} type="search" aria-label="Find any store" placeholder="Find any store, domain or contact…" value={query} maxLength={200} onChange={event => setQuery(event.target.value)} />
      <button className={button} type="submit">Search stores</button>
      <select className={field} aria-label="Store status" value={filter} onChange={event => { setFilter(event.target.value); setOffset(0) }}>
        <option value="all">All stores</option><option value="installed">Installed in Bily</option><option value="former">Uninstalled in Bily</option><option value="needs_audit">Needs audit evidence</option><option value="has_draft">Has outreach draft</option>
      </select>
    </form>
    <div className="grid overflow-hidden rounded-xl border border-kumo-line lg:grid-cols-[minmax(280px,.8fr)_minmax(0,1.2fr)]">
      <section aria-label="Store directory" className="min-w-0 border-b border-kumo-line lg:border-b-0 lg:border-r">
        <div key={`${search}:${filter}:${page?.offset ?? 'loading'}`} className="max-h-96 overflow-auto lg:max-h-[65vh]">
          {!page?.stores.length && <p className="p-5 text-sm leading-6 text-kumo-subtle">{loading ? 'Loading the store directory…' : error ? 'The directory is unavailable. Refresh stores to retry.' : search || filter !== 'all' ? 'No stores match this search.' : 'No store inventory has been captured yet.'}</p>}
          {page?.stores.map(store => <button key={store.key} className={`flex w-full items-start justify-between gap-3 border-b border-kumo-line px-4 py-3 text-left ${store.key === selected ? 'bg-kumo-tint' : 'hover:bg-kumo-elevated'}`} aria-pressed={store.key === selected} onClick={() => setSelected(store.key)}>
            <span className="min-w-0"><span className="block break-words text-sm font-medium text-kumo-default">{store.name || store.domain}</span><span className="mt-1 block break-all text-xs leading-5 text-kumo-subtle">{store.domain || store.shopifyDomain}</span><span className="mt-1 block text-xs leading-5 text-kumo-subtle">{sourceLabel(store)} · {lifecycle(store)} · {store.outreach ? 'Draft available' : 'No draft'}</span></span>
            <span className="max-w-28 shrink-0 text-right text-xs leading-5 text-kumo-subtle">{auditLabel(store)}</span>
          </button>)}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-kumo-line px-4 py-3">
          <span className="text-xs text-kumo-subtle">{page ? `${count(page.stores.length ? page.offset + 1 : 0)}–${count(page.offset + page.stores.length)} of ${count(page.filteredTotal)} stores` : loading ? 'Loading…' : 'Directory unavailable'}</span>
          <div className="flex gap-2"><button className={button} aria-label="Previous stores" disabled={loading || !page || page.offset === 0} onClick={() => setOffset(Math.max(0, (page?.offset ?? 0) - (page?.limit ?? 50)))}><ArrowLeft size={14} /></button><button className={button} aria-label="Next stores" disabled={loading || page?.nextOffset == null} onClick={() => { if (page?.nextOffset != null) setOffset(page.nextOffset) }}><ArrowRight size={14} /></button></div>
        </div>
      </section>
      <article aria-label="Store relationship and sequence" className="min-w-0 p-5 sm:p-6">
        {!row ? <p className="py-10 text-sm leading-6 text-kumo-subtle">Choose a store to review its identity, audit coverage and draft preparation.</p> : <>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs text-kumo-subtle">{sourceLabel(row)}</p><h3 className="mt-2 break-words text-xl font-semibold text-kumo-default">{row.name || row.domain}</h3></div>{row.outreach && <a className={button} href={'/approvals?card=' + encodeURIComponent(row.outreach.cardId)}>Review draft <ArrowUpRight size={14} /></a>}</div>
          <p className="mt-2 break-all text-sm text-kumo-subtle">{row.domain}</p><p className="mt-2 break-all text-sm text-kumo-subtle">{row.contactEmail || 'Current main contact needs verification'}</p>
          <div className="my-5 grid grid-cols-2 gap-4 border-y border-kumo-line py-4 text-sm"><div><p className="text-xs text-kumo-subtle">Bily installation</p><p className="mt-1 text-kumo-default">{lifecycle(row)}</p></div><div><p className="text-xs text-kumo-subtle">Audit</p><p className="mt-1 text-kumo-default">{auditLabel(row)}</p></div><div><p className="text-xs text-kumo-subtle">Shopify identity</p><p className="mt-1 break-all text-kumo-default">{row.shopifyDomain || 'Not linked'}</p></div><div><p className="text-xs text-kumo-subtle">Attio records</p><p className="mt-1 text-kumo-default">{row.attio ? count(row.attio.recordCount) : 'Not linked'}</p></div></div>
          {row.bily?.hasActivePlan === true && <p className="mb-4 text-sm leading-6 text-kumo-subtle">Bily records an active plan. Recovery outreach needs current billing and relationship review.</p>}
          {row.audit?.capturedAt && <p className="text-xs text-kumo-subtle">Audit captured {date(row.audit.capturedAt)}</p>}
          {row.audit?.publicUrl?.startsWith('https://audit.bily.ai/') && <a className="mt-2 inline-flex items-center gap-1 text-sm text-kumo-link" href={row.audit.publicUrl} target="_blank" rel="noopener noreferrer">Open this audit run <ArrowUpRight size={14} /></a>}
          {detailLoading && <p role="status" className="mt-5 text-sm text-kumo-subtle">Loading relationship evidence…</p>}
          {detailError && <p role="alert" className="mt-5 text-sm text-kumo-danger">{detailError}</p>}
          {!detailLoading && !detailError && !review && <p className="mt-5 text-sm leading-6 text-kumo-subtle">No personalised sequence is prepared for this store yet. The directory retains the store while audit and relationship evidence are gathered.</p>}
          {review && <div className="mt-5 space-y-5 text-sm leading-6 text-kumo-subtle">
            <RelationshipBrief brief={review.reviewBrief} context={review.relationship || 'No relationship notes are recorded.'} />
            {review.nextAction && <p><span className="font-medium text-kumo-default">Next useful step:</span> {review.nextAction}</p>}
            {!!review.reasons.length && <details><summary className="cursor-pointer font-medium text-kumo-default">Required before outreach · {review.reasons.length}</summary><ul className="mt-2 list-disc space-y-2 pl-5">{review.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul></details>}
            {review.auditTakeaway && <details><summary className="cursor-pointer font-medium text-kumo-default">Audit evidence and limits</summary><p className="mt-2 whitespace-pre-wrap">{review.auditTakeaway}</p><ul className="mt-2 list-disc space-y-2 pl-5">{review.auditLimitations.map((limit, index) => <li key={index}>{limit}</li>)}</ul></details>}
            {!!review.sequence.length && <section aria-label="Prepared email previews"><h4 className="font-medium text-kumo-default">Prepared email previews</h4><div className="my-3 flex flex-wrap gap-2" role="group" aria-label="Catalog email steps">{review.sequence.map((item, index) => <button key={item.step} className={`${button} ${index === step ? 'bg-kumo-tint' : ''}`} aria-pressed={index === step} onClick={() => setStep(index)}>{index === 0 ? 'First email' : `Follow-up ${index}`}</button>)}</div>{email && <><h5 className="border-b border-kumo-line pb-3 font-medium text-kumo-default">{email.subject}</h5><p className="mt-3 whitespace-pre-wrap break-words">{email.body}</p></>}</section>}
          </div>}
          <p className="mt-6 text-xs leading-5 text-kumo-subtle">Directory inclusion does not approve outreach. Current billing, relationship, contactability and audit checks remain required before sending.</p>
        </>}
      </article>
    </div>
  </section>
}
