import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowClockwise, ArrowUpRight, CheckCircle, ListChecks } from '@phosphor-icons/react'
import { OutreachDeck } from './OutreachDeck'

const button = 'inline-flex items-center justify-center gap-2 rounded-lg border border-kumo-line px-3 py-2 text-sm text-kumo-default hover:bg-kumo-tint disabled:cursor-default disabled:opacity-50'
const primary = `${button} bg-kumo-brand text-white hover:bg-kumo-brand-hover`
const input = 'rounded-lg border border-kumo-line bg-kumo-base px-3 py-2 text-sm text-kumo-default'
const words = (value: string) => value.replaceAll('_', ' ')
const date = (value?: string | null) => value ? new Date(value).toLocaleString() : 'Not recorded'
const message = (error: unknown) => error instanceof Error ? error.message : 'The request could not complete.'

type Identity = { email: string; isAdmin: boolean }
type Source = { complete?: boolean; capturedAt?: string }
type GtmRun = { id: string; preparedAt: string; policyVersion: string; sources: Record<string, Source>; summary: { totalStores: number } }
type GtmRow = {
  key: string; name: string; domain: string; lane: string; status: string; reviewStatus: string
  contentHash: string; reasons: string[]; expiresAt: string | null
  contact: { email: string } | null
  audit: { capturedAt: string; confidence: number; publicUrl: string } | null
  finding: { title: string; evidence: { description: string }[] } | null
  sequence: { step: number; day: number; subject: string; body: string }[]
}
type Job = {
  id: string; objective: string; scope_json: string; risk_class: string; status: string
  created_at: string; updated_at: string; approved_by: string | null
  result_summary: string | null; evidence_json: string | null; safe_error_code: string | null
}
type Health = { enabled: boolean; lastHeartbeatAt: string | null; counts: { queued: number; running: number; attention: number }; identity: Identity }
type JobDetail = { job: Job; events: { id: number; event_type: string; actor: string; created_at: string }[] }

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', ...options })
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('Your Bily session needs refreshing. Sign in again, then retry.')
  }
  const body = await response.json()
  if (!response.ok) throw new Error(body.message || body.code || `Request failed (${response.status}).`)
  return body as T
}

function Notice({ text, error = false }: { text: string; error?: boolean }) {
  return <p role={error ? 'alert' : 'status'} className={`my-4 rounded-lg border border-kumo-line p-3 text-sm ${error ? 'text-kumo-danger' : 'text-kumo-subtle'}`}>{text}</p>
}

/** Native approvals destination, retaining both services' existing authorization checks. */
export function BilyApprovals() {
  const [tab, setTab] = useState<'cards' | 'sequences' | 'runs'>('cards')
  return <div className="mx-auto w-full max-w-7xl px-6 py-8 sm:px-10">
    <h1 className="text-2xl font-semibold tracking-tight text-kumo-default">Approvals</h1>
    <p className="mt-2 text-sm text-kumo-subtle">One store at a time. Review the relationship, choose the next step.</p>
    <div className="mt-5 flex flex-wrap gap-2 border-b border-kumo-line pb-4" role="group" aria-label="Approval queues">
      <button className={tab === 'cards' ? primary : button} aria-pressed={tab === 'cards'} onClick={() => setTab('cards')}><CheckCircle size={16} /> Outreach cards</button>
      <button className={tab === 'sequences' ? primary : button} aria-pressed={tab === 'sequences'} onClick={() => setTab('sequences')}><CheckCircle size={16} /> Customer sequences</button>
      <button className={tab === 'runs' ? primary : button} aria-pressed={tab === 'runs'} onClick={() => setTab('runs')}><ListChecks size={16} /> Internal runs</button>
    </div>
    {tab === 'cards' ? <OutreachDeck /> : tab === 'sequences' ? <GtmQueue /> : <RunQueue approvalsOnly />}
  </div>
}

function GtmQueue() {
  const [runs, setRuns] = useState<GtmRun[]>([])
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [runId, setRunId] = useState('')
  const [rows, setRows] = useState<GtmRow[]>([])
  const [selected, setSelected] = useState('')
  const [step, setStep] = useState(0)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('Loading prepared runs…')
  const [error, setError] = useState(false)
  const [revision, setRevision] = useState(0)
  const file = useRef<HTMLInputElement>(null)
  const run = runs.find((item) => item.id === runId)
  const row = rows.find((item) => item.key === selected)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError(false); setRows([])
    api<{ runs: GtmRun[]; identity: Identity }>('/api/gtm/runs', { signal: controller.signal }).then((data) => {
      if (controller.signal.aborted) return
      setRuns(data.runs); setIdentity(data.identity)
      setRunId((current) => data.runs.some((item) => item.id === current) ? current : data.runs[0]?.id ?? '')
      setStatus(data.runs.length ? 'Choose a store to review its audit and proposed emails.' : 'No prepared customer runs. Import a current snapshot after Attio, store lifecycle, communication history and audit evidence are complete.')
    }).catch((err) => {
      if (!controller.signal.aborted) { setError(true); setStatus(message(err)); setRuns([]); setRunId('') }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [revision])

  useEffect(() => {
    if (!runId) return
    const controller = new AbortController()
    setLoading(true); setRows([]); setSelected(''); setError(false)
    const load = async () => {
      const all: GtmRow[] = []
      let offset: number | null = 0
      while (offset !== null) {
        const page: { rows: GtmRow[]; nextOffset: number | null } = await api(`/api/gtm/runs/${runId}/rows?offset=${offset}`, { signal: controller.signal })
        all.push(...page.rows)
        if (all.length > 5000 || (page.nextOffset !== null && page.nextOffset <= offset)) throw new Error('Run pagination could not complete. Retry the run.')
        offset = page.nextOffset
      }
      if (controller.signal.aborted) return
      setRows(all); setSelected(all.find((item) => item.status === 'ready_for_review' && item.reviewStatus === 'draft')?.key ?? all[0]?.key ?? ''); setStep(0)
    }
    void load().catch((err) => { if (!controller.signal.aborted) { setError(true); setStatus(message(err)); setRows([]) } }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [runId, revision])

  const review = async (target: GtmRow, reviewStatus: 'reviewed' | 'rejected') => {
    setBusy(true); setError(false)
    try {
      const result = await api<{ row: GtmRow }>(`/api/gtm/runs/${runId}/review`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ storeKey: target.key, contentHash: target.contentHash, status: reviewStatus }) })
      setRows((current) => current.map((item) => item.key === target.key ? result.row : item))
      setStatus(reviewStatus === 'reviewed' ? 'Sequence reviewed. It is ready for a reviewed export while its evidence remains current.' : 'Sequence held.')
    } catch (err) { setError(true); setStatus(message(err)) }
    finally { setBusy(false) }
  }

  const importFile = async (snapshot: File) => {
    if (snapshot.size > 8388608) { setError(true); setStatus('Snapshot exceeds 8 MiB.'); return }
    setBusy(true); setError(false); setStatus('Checking identities, communication history and evidence…')
    try {
      const result = await api<{ run: GtmRun }>('/api/gtm/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: await snapshot.text() })
      setRunId(result.run.id); setRevision((current) => current + 1)
    } catch (err) { setError(true); setStatus(message(err)) }
    finally { setBusy(false); if (file.current) file.current.value = '' }
  }

  const visible = rows.filter((item) => {
    const state = item.status === 'held' || item.reviewStatus === 'rejected' ? 'held' : item.reviewStatus === 'reviewed' ? 'reviewed' : 'ready'
    return (filter === 'all' || state === filter) && `${item.name} ${item.domain} ${item.contact?.email ?? ''}`.toLowerCase().includes(query.toLowerCase())
  })
  const currentStep = row?.sequence[step]
  const metrics = [
    ['Stores', rows.length],
    ['Ready for review', rows.filter((r) => r.status === 'ready_for_review' && r.reviewStatus === 'draft').length],
    ['Reviewed', rows.filter((r) => r.status === 'ready_for_review' && r.reviewStatus === 'reviewed').length],
    ['Held', rows.filter((r) => r.status === 'held' || r.reviewStatus === 'rejected').length],
  ]

  return <section aria-label="Customer sequence approvals">
    <div className="mt-5 flex flex-wrap items-center gap-2">
      <button className={button} disabled={busy || loading} onClick={() => setRevision((v) => v + 1)}><ArrowClockwise size={15} /> Refresh</button>
      <button className={button} disabled={!identity?.isAdmin || busy || loading} onClick={() => file.current?.click()}>Import snapshot</button>
      <input ref={file} type="file" aria-label="Snapshot JSON" accept=".json,application/json" hidden onChange={(e) => { const snapshot = e.target.files?.[0]; if (snapshot) void importFile(snapshot) }} />
      {run && !loading && <a className={button} href={`/api/gtm/runs/${run.id}/export`}>Export reviewed</a>}
      <span className="text-xs text-kumo-subtle">{identity?.email} · Preparation mode</span>
    </div>
    <Notice text={status} error={error} />
    <div className="grid grid-cols-2 border-y border-kumo-line sm:grid-cols-4">{metrics.map(([title, value]) => <div key={title} className="py-4"><p className="text-xs text-kumo-subtle">{title}</p><p className="mt-2 text-2xl text-kumo-default">{loading ? '…' : value}</p></div>)}</div>
    {run && <div className="flex flex-wrap gap-3 border-b border-kumo-line py-3 text-xs text-kumo-subtle">{Object.entries(run.sources).map(([name, source]) => <span key={name}>{words(name)} · {source.complete === true ? `captured ${date(source.capturedAt)}` : 'incomplete'}</span>)}<span>Prepared {date(run.preparedAt)}</span></div>}
    <div className="my-4 flex flex-wrap gap-2">
      <input className={`${input} min-w-44 flex-1`} type="search" aria-label="Find a store" placeholder="Find a store or contact…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <select className={input} aria-label="Sequence status" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All stores</option><option value="ready">Ready for review</option><option value="reviewed">Reviewed</option><option value="held">Held</option></select>
      <select className={`${input} max-w-full`} aria-label="Prepared run" disabled={busy || loading} value={runId} onChange={(e) => setRunId(e.target.value)}>{!runs.length && <option value="">No prepared runs</option>}{runs.map((item) => <option key={item.id} value={item.id}>{date(item.preparedAt)} · {item.summary.totalStores} stores</option>)}</select>
    </div>
    <div className="grid overflow-hidden rounded-xl border border-kumo-line lg:grid-cols-[minmax(260px,.8fr)_minmax(0,1.2fr)]">
      <section aria-label="Store queue" className="max-h-80 overflow-auto border-b border-kumo-line p-2 lg:max-h-[65vh] lg:border-b-0 lg:border-r">
        {!visible.length && <p className="p-5 text-sm text-kumo-subtle">{loading ? 'Loading store evidence…' : runs.length ? 'No stores match this view.' : 'Your customer queue will appear here when a complete snapshot is imported.'}</p>}
        {visible.map((item) => <button key={item.key} className={`flex w-full items-start justify-between gap-3 rounded-lg p-3 text-left ${selected === item.key ? 'bg-kumo-tint' : 'hover:bg-kumo-elevated'}`} aria-pressed={selected === item.key} onClick={() => { setSelected(item.key); setStep(0) }}><span className="min-w-0"><span className="block truncate text-sm font-medium text-kumo-default">{item.name}</span><span className="mt-1 block break-all text-xs text-kumo-subtle">{item.domain} · {words(item.lane)}</span></span><span className="shrink-0 text-xs text-kumo-subtle">{item.status === 'held' || item.reviewStatus === 'rejected' ? 'Held' : item.reviewStatus === 'reviewed' ? 'Reviewed' : 'Ready'}</span></button>)}
      </section>
      <article aria-label="Audit and email sequence" className="min-w-0 p-5 sm:p-6">
        {!row ? <p className="py-10 text-sm text-kumo-subtle">Choose a store to inspect its audit, contact and proposed sequence.</p> : <>
          <p className="text-xs text-kumo-subtle">{words(row.lane)}</p><h2 className="mt-2 text-xl font-semibold text-kumo-default">{row.domain}</h2><p className="mt-2 break-all text-sm text-kumo-subtle">{row.contact?.email ?? 'Main contact needs verification'}</p>
          <section className="my-5 border-y border-kumo-line py-5"><h3 className="text-sm font-medium text-kumo-default">{row.finding?.title ?? 'Audit evidence needs attention'}</h3>{row.finding?.evidence.map((proof, index) => <p key={index} className="mt-3 text-sm leading-6 text-kumo-subtle">{proof.description}</p>)}{row.audit && <><p className="mt-3 text-xs text-kumo-subtle">Captured {date(row.audit.capturedAt)} · Confidence {row.audit.confidence}/100</p>{row.audit.publicUrl.startsWith('https://') && <a href={row.audit.publicUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm text-kumo-link">Open audit report <ArrowUpRight size={14} /></a>}</>}</section>
          {row.reasons.length ? <><h3 className="text-sm font-medium text-kumo-default">Required before outreach</h3><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-kumo-subtle">{row.reasons.map((reason) => <li key={reason}>{words(reason)}</li>)}</ul></> : <>
            <div role="group" aria-label="Email steps" className="mb-4 flex flex-wrap gap-2">{row.sequence.map((email, index) => <button key={email.step} className={step === index ? primary : button} aria-pressed={step === index} onClick={() => setStep(index)}>Email {email.step} · Day {email.day}</button>)}</div>
            {currentStep && <div className="rounded-lg border border-kumo-line bg-kumo-elevated p-4"><h3 className="border-b border-kumo-line pb-3 text-sm font-medium text-kumo-default">{currentStep.subject}</h3><p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-kumo-default">{currentStep.body}</p></div>}
            {identity?.isAdmin && <div className="mt-4 flex flex-wrap gap-2"><button className={primary} disabled={busy || loading || row.reviewStatus === 'reviewed'} onClick={() => { void review(row, 'reviewed') }}>Mark reviewed</button><button className={button} disabled={busy || loading || row.reviewStatus === 'rejected'} onClick={() => { void review(row, 'rejected') }}>Hold sequence</button></div>}
          </>}
          <p className="mt-4 text-xs leading-5 text-kumo-subtle">{words(row.reviewStatus || 'draft')} · Evidence expires {date(row.expiresAt)}. Review does not send or enroll email. Export checks current evidence again.</p>
        </>}
      </article>
    </div>
  </section>
}

/** Native run history and intake; the executor remains governed by its existing control plane. */
export function BilyRuns() {
  return <div className="mx-auto w-full max-w-7xl px-6 py-8 sm:px-10"><h1 className="text-2xl font-semibold text-kumo-default">Runs</h1><p className="mt-2 text-sm text-kumo-subtle">Request bounded work, review execution history, and follow evidence.</p><RunQueue /></div>
}

function RunQueue({ approvalsOnly = false }: { approvalsOnly?: boolean }) {
  const [health, setHealth] = useState<Health | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [selected, setSelected] = useState('')
  const [detail, setDetail] = useState<JobDetail | null>(null)
  const [status, setStatus] = useState('Loading run status…')
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [objective, setObjective] = useState('')
  const [risk, setRisk] = useState('observe')
  const [revision, setRevision] = useState(0)
  const [now, setNow] = useState(Date.now())
  const intakeKey = useRef(crypto.randomUUID())
  const visible = approvalsOnly ? jobs.filter((job) => job.status === 'awaiting_approval') : jobs
  const row = detail?.job.id === selected ? detail.job : undefined
  const heartbeatAge = health?.lastHeartbeatAt ? now - Date.parse(health.lastHeartbeatAt) : NaN
  const alive = Number.isFinite(heartbeatAge) && heartbeatAge >= -300000 && heartbeatAge < 180000

  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer) }, [])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError(false)
    void Promise.all([
      api<Health>('/api/codex-control/health', { signal: controller.signal }),
      api<{ jobs: Job[] }>('/api/codex-control/jobs?limit=100', { signal: controller.signal }),
    ]).then(([nextHealth, nextJobs]) => {
      if (controller.signal.aborted) return
      setHealth(nextHealth); setJobs(nextJobs.jobs)
      const candidates = approvalsOnly ? nextJobs.jobs.filter((job) => job.status === 'awaiting_approval') : nextJobs.jobs
      setSelected((current) => candidates.some((job) => job.id === current) ? current : candidates[0]?.id ?? '')
      setStatus('Showing the latest 100 runs. Refresh for new execution updates.')
    }).catch((err) => { if (!controller.signal.aborted) { setError(true); setStatus(message(err)); setHealth(null); setJobs([]); setSelected('') } }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [revision, approvalsOnly])
  useEffect(() => {
    setDetail(null)
    if (!selected) return
    const controller = new AbortController()
    void api<JobDetail>(`/api/codex-control/jobs/${selected}`, { signal: controller.signal }).then((data) => { if (!controller.signal.aborted) setDetail(data) }).catch((err) => { if (!controller.signal.aborted) { setError(true); setStatus(message(err)) } })
    return () => controller.abort()
  }, [selected, revision])

  const action = async (kind: 'approve' | 'cancel') => {
    if (!row) return
    setBusy(true); setError(false)
    try {
      await api(`/api/codex-control/jobs/${row.id}/${kind}`, { method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: '{}' })
      setStatus(kind === 'approve' ? 'Internal run approved for its displayed scope.' : 'Run cancellation recorded.'); setRevision((value) => value + 1)
    } catch (err) { setError(true); setStatus(message(err)) }
    finally { setBusy(false) }
  }
  const create = async () => {
    setBusy(true); setError(false)
    try {
      const result = await api<{ job: Job }>('/api/codex-control/jobs', { method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': intakeKey.current }, body: JSON.stringify({ objective, riskClass: risk }) })
      intakeKey.current = crypto.randomUUID(); setObjective(''); setSelected(result.job.id); setRevision((value) => value + 1)
    } catch (err) { setError(true); setStatus(message(err)) }
    finally { setBusy(false) }
  }

  return <section aria-label={approvalsOnly ? 'Internal run approvals' : 'Codex runs'}>
    <div className="mt-5 flex flex-wrap items-center gap-3"><button className={button} disabled={loading || busy} onClick={() => setRevision((value) => value + 1)}><ArrowClockwise size={15} /> Refresh</button><p className="text-sm text-kumo-subtle">{health ? !health.enabled ? 'Execution paused' : alive ? 'Executor heartbeat current' : 'No recent executor heartbeat' : 'Executor status unavailable'} · Last heartbeat {date(health?.lastHeartbeatAt)}</p></div>
    <Notice text={status} error={error} />
    {health && <div className="mb-5 flex flex-wrap gap-6 text-sm text-kumo-subtle"><span>{health.counts.queued} queued</span><span>{health.counts.running} leased / running</span><span>{health.counts.attention} need attention</span></div>}
    {!approvalsOnly && <form className="mb-5 rounded-xl border border-kumo-line p-4" onSubmit={(e) => { e.preventDefault(); void create() }}>
      <label htmlFor="run-objective" className="text-sm font-medium text-kumo-default">Request a run</label>
      <textarea id="run-objective" className={`${input} mt-2 min-h-24 w-full`} value={objective} minLength={8} maxLength={4000} required placeholder="Describe the exact objective, store or project, and the allowed scope…" onChange={(e) => { setObjective(e.target.value); intakeKey.current = crypto.randomUUID() }} />
      <div className="mt-3 flex flex-wrap gap-3"><select aria-label="Run scope" className={input} value={risk} onChange={(e) => { setRisk(e.target.value); intakeKey.current = crypto.randomUUID() }}><option value="observe">Analysis and preparation</option><option value="internal_write">Internal execution · approval required</option></select><button type="submit" className={primary} disabled={busy || loading}>{busy ? 'Saving…' : 'Request run'}</button></div>
      <p className="mt-3 text-xs text-kumo-subtle">Keep credentials out of the objective. Internal approval covers the displayed objective and scope. External messages, publication, permissions and spending require their own explicit authorization. A queued run waits for the connected executor.</p>
    </form>}
    <div className="grid overflow-hidden rounded-xl border border-kumo-line lg:grid-cols-[minmax(260px,.8fr)_minmax(0,1.2fr)]">
      <section aria-label="Run queue" className="max-h-80 overflow-auto border-b border-kumo-line p-2 lg:max-h-[60vh] lg:border-b-0 lg:border-r">{!visible.length && <p className="p-5 text-sm text-kumo-subtle">{loading ? 'Loading runs…' : approvalsOnly ? 'No pending internal approvals in the latest 100 runs.' : 'No runs yet.'}</p>}{visible.map((job) => <button key={job.id} className={`w-full rounded-lg p-3 text-left ${job.id === selected ? 'bg-kumo-tint' : 'hover:bg-kumo-elevated'}`} aria-pressed={job.id === selected} onClick={() => setSelected(job.id)}><span className="block line-clamp-2 text-sm text-kumo-default">{job.objective}</span><span className="mt-2 block text-xs text-kumo-subtle">{words(job.status)} · {date(job.updated_at)}</span></button>)}</section>
      <article aria-label="Run details" className="min-w-0 p-5 sm:p-6">{!row ? <p className="py-8 text-sm text-kumo-subtle">{selected ? 'Loading run evidence…' : 'Choose a run to review its scope and history.'}</p> : <>
        <p className="text-xs text-kumo-subtle">{words(row.status)} · {words(row.risk_class)}</p><h2 className="mt-3 whitespace-pre-wrap break-words text-lg font-medium text-kumo-default">{row.objective}</h2>
        <p className="mt-3 text-xs text-kumo-subtle">Created {date(row.created_at)} · Updated {date(row.updated_at)}</p>
        {row.scope_json && row.scope_json !== '{}' && <section className="mt-5"><h3 className="text-sm font-medium text-kumo-default">Execution scope</h3><pre className="mt-2 whitespace-pre-wrap break-all rounded-lg bg-kumo-elevated p-3 text-xs text-kumo-default">{row.scope_json}</pre></section>}
        {row.status === 'awaiting_approval' && <><p className="my-4 text-sm text-kumo-subtle">Review the exact objective and scope before approving internal execution.</p>{health?.identity.isAdmin ? <button className={primary} disabled={busy || loading} onClick={() => { void action('approve') }}>Approve internal run</button> : <p className="text-sm text-kumo-subtle">An administrator must approve this run.</p>}</>}
        {!['succeeded', 'cancelled', 'dead_letter'].includes(row.status) && <button className={`${button} ml-2`} disabled={busy || loading} onClick={() => { void action('cancel') }}>Cancel run</button>}
        {row.result_summary && <section className="mt-5"><h3 className="text-sm font-medium text-kumo-default">Result</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm text-kumo-subtle">{row.result_summary}</p></section>}
        {row.safe_error_code && <p className="mt-4 text-sm text-kumo-subtle">{words(row.safe_error_code)}</p>}
        {row.evidence_json && row.evidence_json !== '[]' && <details className="mt-5 text-sm text-kumo-subtle"><summary>Run evidence</summary><pre className="mt-2 whitespace-pre-wrap break-all text-xs">{row.evidence_json}</pre></details>}
        <h3 className="mt-6 text-sm font-medium text-kumo-default">Activity</h3><ol className="mt-3 space-y-3">{detail?.events.map((event) => <li key={event.id} className="text-xs text-kumo-subtle">{words(event.event_type)} · {event.actor}<span className="mt-1 block">{date(event.created_at)}</span></li>)}</ol>
      </>}</article>
    </div>
    {approvalsOnly && <Link to="/runs" className="mt-4 inline-flex text-sm text-kumo-link">View all runs →</Link>}
  </section>
}
