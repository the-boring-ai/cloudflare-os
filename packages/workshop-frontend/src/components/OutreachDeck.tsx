import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { ArrowClockwise, ArrowCounterClockwise, ArrowLeft, ArrowRight, ArrowUpRight, Check, CheckCircle, Clock, PaperPlaneTilt, Pause, PencilSimple, X } from '@phosphor-icons/react'
import { RelationshipBrief, type ReviewBrief } from './RelationshipBrief'
import './OutreachDeck.css'

const secondary = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-kumo-line px-4 py-2 text-sm text-kumo-default hover:bg-kumo-tint disabled:cursor-default disabled:opacity-45'
const primary = `${secondary} border-transparent bg-kumo-brand text-white hover:bg-kumo-brand-hover`
const field = 'w-full rounded-lg border border-kumo-line bg-kumo-base px-3 py-2 text-sm text-kumo-default'
const date = (value?: string | null) => value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not verified'
type Email = { step: number; subject: string; body: string; trigger: string }
type Card = {
  senderLane?: 'cold'; id: string; name: string; domain: string; path: string; recipient: string; context: string; impact: string; priority: string; nextAction: string; decision: string; signature: string
  contentHash: string; revision: number; reviewState: 'draft' | 'approved' | 'skipped' | 'held'; serviceReview: boolean; refreshRequested: boolean; gates: string[]; checkedAt: string | null; replyMessageId: string | null
  steps: Email[]; attio: { personId: string; shopifyDomain: string; contactConfidence: string }
  audit: { taskId: string | null; completedAt: string; takeaway: string; auditedUrl: string; source?: string; publicUrl?: string | null; resultStatus?: string; limitations?: string[] }
  history: { gmailThreadIds: string[]; coverage: string }
  reviewBrief?: ReviewBrief
  outbox: null | { id: string; status: string; blockReasons: string[]; approved_at: string; approval_expires_at: string; sent_message_id: string | null; sent_thread_id: string | null; sent_at: string | null; dispatch_fence_at: string | null }
}
type Deck = { cards: Card[]; identity: { email: string; isAdmin: boolean }; sender: { enabled: boolean; dailyLimit: number; lastHeartbeatAt: string | null }; inventory: null | { storeLinkedRecords?: number; auditedDraftedStores?: number; billingHolds?: number; draftReviewCandidates?: number } }
type View = 'review' | 'approved' | 'sent' | 'held' | 'skipped'
const label = (card: Card) => card.outbox?.status === 'sent' ? 'Sent' : card.outbox?.status === 'dispatching' ? 'Sending' : card.outbox?.status === 'unknown' ? 'Check send outcome' : card.reviewState === 'approved' ? card.gates.length || card.outbox?.status === 'blocked' ? 'Approved · checks needed' : 'Approved · queued' : card.reviewState === 'held' ? 'Held' : card.reviewState === 'skipped' ? 'Skipped' : card.serviceReview ? 'Service first' : 'For review'
const belongs = (card: Card, view: View) => view === 'sent' ? card.outbox?.status === 'sent' : view === 'approved' ? card.reviewState === 'approved' && card.outbox?.status !== 'sent' : card.reviewState === ({ review: 'draft', held: 'held', skipped: 'skipped' } as const)[view]
const auditLabel = (card: Card) => card.audit.resultStatus === 'verified_finding' ? 'Verified measurement finding' : card.audit.resultStatus === 'implementation_opportunity' ? 'Implementation opportunity · observed delivery route' : card.audit.resultStatus === 'observed_event_anomaly' ? 'Repeated event observed · controlled verification required' : card.audit.resultStatus === 'access_limited' ? 'Access limited · tracking unverified' : card.audit.resultStatus === 'needs_review' ? 'Finding needs verification' : card.audit.source === 'audit.bily.ai' ? 'No verified commercial finding' : 'Historical audit evidence'

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch('/api/gtm/outreach' + path, { credentials: 'same-origin', ...init })
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Sign in to Bily OS again to continue reviewing.')
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || 'The review could not be saved.')
  return data as T
}

/** One store, one exact first email, and a durable decision before automatic dispatch. */
export function OutreachDeck() {
  const [deck, setDeck] = useState<Deck | null>(null)
  const [batch] = useState(() => {
    const value = new URLSearchParams(window.location.search).get('batch')
    return value && /^bily-gtm-\d{1,3}-\d{8}$/.test(value) ? value : null
  })
  const [requestedCard] = useState(() => {
    const value = new URLSearchParams(window.location.search).get('card')
    return value && /^card_[a-f0-9]{24}$/.test(value) ? value : null
  })
  const requestedCardResolved = useRef(false)
  const [view, setView] = useState<View>('review')
  const [selected, setSelected] = useState(requestedCard || '')
  const [step, setStep] = useState(0)
  const [detail, setDetail] = useState<'relationship' | 'audit' | 'checks'>('relationship')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [revision, setRevision] = useState(0)
  const [drag, setDrag] = useState(0)
  const [undo, setUndo] = useState<string | null>(null)
  const inFlight = useRef(false)
  const pointer = useRef<{ id: number; x: number; y: number } | null>(null)
  const scopedCards = deck?.cards.filter(card => !batch || card.context.includes(`\nBatch ${batch};`)) || []
  const visible = scopedCards.filter(card => belongs(card, view))
  const card = visible.find(item => item.id === selected) || (requestedCard && selected === requestedCard ? undefined : visible[0])
  const current = card?.steps[step]
  const blocks = [...new Set([...(card?.gates || []), ...(card?.outbox?.status === 'blocked' ? card.outbox.blockReasons : [])])]
  const senderAlive = !!deck?.sender.lastHeartbeatAt && Date.now() - Date.parse(deck.sender.lastHeartbeatAt) < 8 * 60000

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      try {
        const data = await api<Deck>('', { signal: controller.signal })
        if (!controller.signal.aborted) {
          setDeck(data); setError(requestedCard && !data.cards.some(item => item.id === requestedCard && (!batch || item.context.includes(`\nBatch ${batch};`))) ? 'This store card is not available in the current review queue. Choose another store to continue.' : '')
          if (requestedCard && !requestedCardResolved.current) {
            requestedCardResolved.current = true
            const target = data.cards.find(item => item.id === requestedCard && (!batch || item.context.includes(`\nBatch ${batch};`)))
            if (target) { setSelected(target.id); setView(target.outbox?.status === 'sent' ? 'sent' : target.reviewState === 'approved' ? 'approved' : target.reviewState === 'held' ? 'held' : target.reviewState === 'skipped' ? 'skipped' : 'review') }
            else setError('This store card is not available in the current review queue.')
          }
        }
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'The queue could not load.') }
      finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void load()
    const timer = setInterval(() => { void load() }, 15000)
    return () => { controller.abort(); clearInterval(timer) }
  }, [revision])
  useEffect(() => { setStep(0); setEditing(false); setDrag(0); pointer.current = null }, [card?.id])

  const update = (next: Card) => setDeck(value => value ? { ...value, cards: value.cards.map(item => item.id === next.id ? next : item) } : value)
  const mutate = async (target: Card, endpoint: string, input: Record<string, unknown>) => {
    if (inFlight.current) return false
    inFlight.current = true; setBusy(true); setError('')
    try {
      const result = await api<{ card: Card }>(`/${target.id}/${endpoint}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contentHash: target.contentHash, ...input }) })
      update(result.card)
      return true
    } catch (err) { setError(err instanceof Error ? err.message : 'The decision could not be saved.'); return false }
    finally { inFlight.current = false; setBusy(false); setDrag(0) }
  }
  const decide = async (action: 'approve' | 'skip' | 'hold') => {
    if (!card || editing || step !== 0 || !deck?.identity.isAdmin || (action === 'approve' && !deck.sender.enabled)) return
    const target = card
    if (await mutate(target, 'action', { action })) {
      setUndo(target.id)
      setNotice(action === 'approve' ? 'Email 1 approved. It will send automatically after the final checks pass.' : action === 'skip' ? 'Skipped for now. You can return to this store.' : 'Held. Automatic sending for this store is stopped.')
      setSelected('')
    }
  }
  const restore = async () => {
    const previous = deck?.cards.find(item => item.id === undo)
    if (previous && await mutate(previous, 'action', { action: 'restore' })) { setView('review'); setSelected(previous.id); setUndo(null); setNotice('Decision withdrawn. The email is back for review.') }
  }
  const startEdit = () => { if (!card) return; setSubject(card.steps[0].subject); setBody(card.steps[0].body); setStep(0); setEditing(true) }
  const save = async () => { if (card && await mutate(card, 'edit', { subject, body })) { setEditing(false); setNotice('Draft saved. Any previous approval was withdrawn.') } }
  const refresh = async () => { if (card && await mutate(card, 'refresh', {})) setNotice('A fresh billing, relationship and audit check has been requested.') }
  const down = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (busy || editing || step !== 0 || view !== 'review' || event.button !== 0 || (event.target as HTMLElement).closest('a,button,input,textarea,select')) return
    pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = pointer.current; if (!start) return
    const dx = event.clientX - start.x, dy = event.clientY - start.y
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 20) { pointer.current = null; setDrag(0); return }
    if (Math.abs(dx) > 8) setDrag(Math.max(-240, Math.min(240, dx)))
  }
  const up = () => { pointer.current = null; if (drag > 110) void decide('approve'); else if (drag < -110) void decide('skip'); else setDrag(0) }
  const counts = (name: View) => scopedCards.filter(item => belongs(item, name)).length
  const terminal = !!card?.outbox?.dispatch_fence_at

  return <section aria-label="Outreach card review" className="outreach-deck">
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-xs text-kumo-subtle"><span className={`h-1.5 w-1.5 rounded-full ${deck?.sender.enabled ? 'bg-kumo-brand' : 'bg-kumo-line'}`} /><span>{deck?.sender.enabled ? senderAlive ? 'Automatic sender online' : 'Approvals wait for the sender' : 'Automatic sending paused'}</span>{deck && <span>· {deck.sender.dailyLimit} emails / day</span>}</div>
      <button className={secondary} onClick={() => setRevision(value => value + 1)} disabled={busy} aria-label="Refresh outreach queue"><ArrowClockwise size={15} /></button>
    </div>
    {batch ? <p className="mt-3 text-xs leading-5 text-kumo-subtle">{scopedCards.length} {scopedCards.length === 1 ? 'store' : 'stores'} · {scopedCards.filter(item => item.senderLane === 'cold').length} cold · {scopedCards.filter(item => item.senderLane !== 'cold').length} warm · {counts('held')} held <a className="ml-2 text-kumo-link" href="/approvals?view=sequences">View all stores</a></p> : deck && <p className="mt-3 text-xs leading-5 text-kumo-subtle">{scopedCards.length} prepared outreach {scopedCards.length === 1 ? 'card' : 'cards'} <a className="ml-2 text-kumo-link" href="/approvals?view=sequences">Browse all stores</a></p>}
    <details className="mt-3 text-xs leading-6 text-kumo-subtle"><summary className="cursor-pointer">Outreach framework{deck ? ` · ${scopedCards.length}-store review` : ''}</summary><p className="mt-2 max-w-3xl">Start with the relationship and one evidenced measurement issue, explain its effect on campaign decisions, then propose a bounded verification or repair. Prioritize conversion delivery, repeated events, Google Tag Gateway and GTM implementation. Keep confirmed failures, observed anomalies and implementation opportunities distinct. Follow-ups adapt to the reply. Service, refund and trust issues need resolution before a sales sequence.</p><p className="mt-1">Based on Winning by Design’s <a className="text-kumo-link" href="https://winningbydesign.com/spiced-framework/" target="_blank" rel="noopener noreferrer">SPICED framework</a>. Customer impact, deadlines and buying decisions need evidence. Approval covers the first email shown.</p></details>
    <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Outreach views">{(['review','approved','sent','held','skipped'] as View[]).map(name => <button key={name} className={view === name ? primary : secondary} aria-pressed={view === name} onClick={() => { setView(name); setSelected(''); setStep(0); setEditing(false) }}>{({ review: 'To review', approved: 'Approved', sent: 'Sent', held: 'Held', skipped: 'Skipped' })[name]} <span className="text-xs opacity-70">{counts(name)}</span></button>)}</div>
    {error && <p role="alert" className="mt-4 rounded-xl border border-kumo-line p-3 text-sm text-kumo-danger">{error}</p>}
    <div className="mx-auto mt-7 max-w-3xl">
      <div className="mb-3 flex items-center justify-between gap-3 text-xs text-kumo-subtle"><span>{loading && !deck ? 'Loading your stores…' : visible.length ? `${visible.length} ${visible.length === 1 ? 'store' : 'stores'} in this view` : 'All caught up'}</span><button className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-kumo-tint disabled:opacity-40" disabled={!undo || busy} onClick={() => { void restore() }}><ArrowCounterClockwise size={14} /> Undo review</button></div>
      {visible.length > 1 && <label className="mb-4 block text-xs text-kumo-subtle">Store in this view<select className={`${field} mt-2 text-sm`} aria-label="Choose a store" value={card?.id || ''} disabled={busy || editing} onChange={event => setSelected(event.target.value)}>{visible.map(item => <option key={item.id} value={item.id}>{item.name} · {item.domain}</option>)}</select></label>}
      {!card ? <div className="rounded-2xl border border-kumo-line bg-kumo-base px-6 py-16 text-center"><CheckCircle size={36} className="mx-auto text-kumo-subtle" /><h2 className="mt-4 text-xl font-medium text-kumo-default">{loading && !deck ? 'Loading outreach' : view === 'review' ? 'You are through the stack' : 'Nothing here yet'}</h2><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-kumo-subtle">{view === 'review' ? 'Approved emails stay in the queue until the final checks pass. Sent receipts appear in Sent.' : 'Your decisions and verified send receipts will appear here.'}</p>{view === 'review' && counts('approved') > 0 && <button className={`${secondary} mt-6`} onClick={() => setView('approved')}>View approved emails <ArrowRight size={15} /></button>}</div> : <>
        <div className="outreach-stack">
          {visible.length > 1 && <div aria-hidden="true" className="outreach-stack-back rounded-2xl border border-kumo-line bg-kumo-elevated" />}
          <article key={card.id} className="outreach-card relative rounded-2xl border border-kumo-line bg-kumo-base" style={{ transform: `translateX(${drag}px) rotate(${drag / 35}deg)` }} aria-label={`${card.name} outreach card`} tabIndex={0} onKeyDown={event => { if ((event.target as HTMLElement).closest('input,textarea,button,a,select,summary') || view !== 'review' || editing || event.ctrlKey || event.metaKey || event.altKey) return; if (event.key === 'ArrowLeft') { event.preventDefault(); void decide('skip') } if (event.key === 'ArrowRight') { event.preventDefault(); void decide('approve') } if (event.key.toLowerCase() === 'h') { event.preventDefault(); void decide('hold') } }}>
            {Math.abs(drag) > 35 && <span aria-hidden="true" className={`pointer-events-none absolute right-5 top-5 z-10 rounded-lg border-2 border-current bg-kumo-base px-3 py-1 text-sm font-semibold ${drag > 0 ? 'text-kumo-link' : 'text-kumo-subtle'}`}>{drag > 0 ? 'APPROVE' : 'SKIP'}</span>}
            <div className="outreach-drag-handle border-b border-kumo-line px-5 pb-5 pt-6 sm:px-7" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { pointer.current = null; setDrag(0) }}>
              <div className="flex items-start justify-between gap-4"><div className="flex min-w-0 items-center gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-kumo-line bg-kumo-tint text-sm font-semibold text-kumo-default">{card.name.split(/\s+/).slice(0,2).map(word => word[0]).join('').toUpperCase()}</span><div className="min-w-0"><h2 className="truncate text-lg font-semibold tracking-tight text-kumo-default">{card.name}</h2><span className="mt-1 block truncate text-xs text-kumo-subtle">{card.domain}</span></div></div><span className="shrink-0 rounded-full border border-kumo-line px-2.5 py-1 text-xs text-kumo-subtle">{label(card)}</span></div>
              <p className="mt-4 text-sm leading-6 text-kumo-subtle">{card.priority}</p>
              <p className="mt-2 text-xs text-kumo-subtle">{card.path}</p>
            </div>
            <div className="px-5 pb-6 pt-5 sm:px-7">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div className="flex gap-1" role="group" aria-label="Email preview steps">{card.steps.map((email, index) => <button key={email.step} className={`rounded-lg px-3 py-1.5 text-xs ${step === index ? 'bg-kumo-tint font-medium text-kumo-default' : 'text-kumo-subtle hover:bg-kumo-elevated'}`} aria-pressed={step === index} onClick={() => { setStep(index); setEditing(false) }}>{index === 0 ? 'First email' : `Follow-up ${index}`}</button>)}</div>{!terminal && deck?.identity.isAdmin && <button className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-kumo-subtle hover:bg-kumo-tint" onClick={startEdit} disabled={busy || editing}><PencilSimple size={14} /> Edit</button>}</div>
              <p className="mb-2 break-all text-xs text-kumo-subtle">To {card.recipient} · From {card.senderLane === 'cold' ? 'clara@bily.chat' : 'philippe@bily.ai'}</p>
              {editing ? <form onSubmit={event => { event.preventDefault(); void save() }}><label className="mb-2 block text-xs text-kumo-subtle" htmlFor="outreach-subject">Subject</label><input id="outreach-subject" className={field} value={subject} maxLength={240} required onChange={event => setSubject(event.target.value)} /><label className="mb-2 mt-4 block text-xs text-kumo-subtle" htmlFor="outreach-body">Message</label><textarea id="outreach-body" className={`${field} min-h-64 leading-7`} value={body} maxLength={12000} required onChange={event => setBody(event.target.value)} /><div className="mt-3 flex gap-2"><button type="submit" className={primary} disabled={busy}>Save draft</button><button type="button" className={secondary} onClick={() => setEditing(false)} disabled={busy}>Cancel</button></div><p className="mt-2 text-xs text-kumo-subtle">Editing withdraws the previous approval. The sender signature and opt-out are included below.</p></form> : current && <><h3 className="border-b border-kumo-line pb-4 text-base font-medium text-kumo-default">{current.subject}</h3><p className="outreach-email mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-kumo-default">{current.body}</p><details className="mt-4 text-xs text-kumo-subtle"><summary className="cursor-pointer">Sender signature and opt-out</summary><p className="mt-2 whitespace-pre-wrap leading-5">{card.signature}</p></details></>}
              {step > 0 && current && <p className="mt-4 rounded-lg bg-kumo-tint p-3 text-xs leading-5 text-kumo-subtle"><Clock className="mr-1 inline" size={13} /> {current.trigger}</p>}
            </div>
            <div className="border-t border-kumo-line bg-kumo-elevated/40 px-5 pb-5 pt-3 sm:px-7">
              <div role="group" aria-label="Store evidence" className="flex flex-wrap gap-1">{(['relationship','audit','checks'] as const).map(name => <button key={name} className={`rounded-lg px-3 py-2 text-xs ${detail === name ? 'bg-kumo-tint text-kumo-default' : 'text-kumo-subtle hover:bg-kumo-tint'}`} aria-pressed={detail === name} onClick={() => setDetail(name)}>{name === 'relationship' ? 'Relationship' : name === 'audit' ? 'Audit evidence' : `Send checks${blocks.length ? ` · ${blocks.length}` : ''}`}</button>)}</div>
              <div className="mt-3 text-sm leading-6 text-kumo-subtle">{detail === 'relationship' ? <><RelationshipBrief brief={card.reviewBrief} context={card.context} /><p className="mt-3"><span className="font-medium text-kumo-default">Next useful step:</span> {card.nextAction}</p><a className="mt-3 inline-flex items-center gap-1 text-xs text-kumo-link" href={`https://app.attio.com/bily/person/${card.attio.personId}`} target="_blank" rel="noopener noreferrer">Open Attio <ArrowUpRight size={12} /></a></> : detail === 'audit' ? <><p className="mb-2 text-xs font-medium text-kumo-default">{auditLabel(card)}</p><p>{card.audit.takeaway}</p><p className="mt-3 text-xs">Checked {date(card.audit.completedAt)} · {card.audit.source === 'audit.bily.ai' ? 'audit.bily.ai' : 'Historical source'}</p>{card.audit.publicUrl && <a className="mt-2 inline-flex items-center gap-1 text-xs text-kumo-link" href={card.audit.publicUrl} target="_blank" rel="noopener noreferrer">Open this audit run <ArrowUpRight size={12} /></a>}{!!card.audit.limitations?.length && <details className="mt-3 text-xs"><summary className="cursor-pointer">Coverage limits</summary><ul className="mt-2 list-disc space-y-1 pl-4">{card.audit.limitations.map(item => <li key={item}>{item}</li>)}</ul></details>}<p className="mt-2 break-all text-xs">{card.attio.shopifyDomain}</p></> : <><p className="mb-2 text-xs">Checked {card.checkedAt ? new Date(card.checkedAt).toLocaleString() : 'Not verified'}. Approvals expire after 24 hours.</p>{blocks.length ? <ul className="list-disc space-y-1 pl-4 text-xs leading-5">{blocks.map(reason => <li key={reason}>{reason}</li>)}</ul> : <p className="inline-flex items-center gap-2 text-xs"><CheckCircle size={15} /> Current checks are clear.</p>}<button className={`${secondary} mt-3`} onClick={() => { void refresh() }} disabled={busy || terminal}><ArrowClockwise size={14} /> Refresh checks</button></>}</div>
            </div>
          </article>
        </div>
        {!editing && !terminal && deck?.identity.isAdmin && <div className="outreach-actions sticky bottom-0 z-20 mt-5 grid grid-cols-[1fr_auto_1.4fr] gap-2 rounded-xl bg-kumo-base py-3 sm:gap-3"><button className={secondary} disabled={busy || step !== 0} onClick={() => { void decide('skip') }}><X size={17} /> Skip</button><button className={secondary} disabled={busy || step !== 0} onClick={() => { void decide('hold') }}><Pause size={17} /> Hold</button><button className={primary} disabled={busy || step !== 0 || !deck.sender.enabled || card.reviewState === 'approved'} onClick={() => { void decide('approve') }}>{busy ? <Clock size={17} /> : <PaperPlaneTilt size={17} />}{busy ? 'Saving…' : card.gates.length ? 'Approve & queue' : 'Approve & send'}</button></div>}
        {terminal && <p className="mt-5 flex items-center justify-center gap-2 text-sm text-kumo-subtle">{card.outbox?.status === 'sent' ? <Check size={17} /> : <Clock size={17} />}{card.outbox?.status === 'sent' ? `Sent ${date(card.outbox.sent_at)}` : card.outbox?.status === 'unknown' ? 'Send outcome needs verification. Automatic retries are stopped.' : 'Sending has started. This decision can no longer be withdrawn.'}</p>}
        {card.outbox?.status === 'sent' && card.outbox.sent_thread_id && <a className="mt-3 flex items-center justify-center gap-1 text-xs text-kumo-link" href={`https://mail.google.com/mail/u/0/#sent/${card.outbox.sent_thread_id}`} target="_blank" rel="noopener noreferrer">Open sent email <ArrowUpRight size={12} /></a>}
        {card.reviewState === 'approved' && card.outbox && !card.outbox.dispatch_fence_at && <a className={`${secondary} mt-4 w-full justify-center`} href={'/email?' + new URLSearchParams({ run: card.outbox.id, store: card.id, hash: card.contentHash }).toString()}>Prepare Google Workspace delivery <PaperPlaneTilt size={14} /></a>}
        <p className="mt-4 text-center text-xs leading-5 text-kumo-subtle">{step > 0 ? 'Follow-ups are previews. Each needs a new review after the relationship changes.' : card.gates.length ? 'Approval saves this exact first email. Sending waits for billing, relationship and audit checks.' : 'Approval sends this exact first email automatically. Replies and opt-outs stop further outreach.'}</p>
        {view === 'review' && <p className="mt-2 flex items-center justify-center gap-4 text-[11px] text-kumo-subtle"><span className="inline-flex items-center gap-1"><ArrowLeft size={11} /> Skip</span><span>H Hold</span><span className="inline-flex items-center gap-1"><ArrowRight size={11} /> Approve</span><span>Swipe the card header</span></p>}
      </>}
      <p role="status" aria-live="polite" className="mt-5 min-h-5 text-center text-xs leading-5 text-kumo-subtle">{notice}</p>
    </div>
  </section>
}
