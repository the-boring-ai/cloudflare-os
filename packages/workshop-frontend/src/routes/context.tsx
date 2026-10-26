import { createFileRoute, Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { BookOpen, Sparkle, ArrowUpRight, MagnifyingGlass } from '@phosphor-icons/react'
import { BILY_LIBRARY } from '@gadgets/workshop-shared/bily-library'
import Markdown from 'react-markdown'
import { useDocumentTitle } from '../useDocumentTitle'

export const Route = createFileRoute('/context')({ component: ContextPage })

function ContextPage() {
  useDocumentTitle('Context & Skills')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const [selectedId, setSelectedId] = useState('bily-operating-context')
  const [copyMessage, setCopyMessage] = useState('')
  const categories = ['All', ...new Set(BILY_LIBRARY.entries.map((entry) => entry.category))]
  const entries = useMemo(() => BILY_LIBRARY.entries.filter((entry) =>
    (category === 'All' || entry.category === category) &&
    `${entry.title} ${entry.summary} ${entry.category}`.toLowerCase().includes(query.toLowerCase()),
  ), [query, category])
  const selected = BILY_LIBRARY.entries.find((entry) => entry.id === selectedId)!
  const prompt = `Use the Bily Context & Skills library entry "${selected.title}" (${selected.id}). First read the Bily operating context and this entry through BILY_OPERATIONS.readSkill when that capability is connected. If it is unavailable, ask me to paste the reviewed instructions from Context & Skills. Confirm the required sources and executor before proceeding. Help me with: `

  return (
    <div className="mx-auto flex h-full w-full max-w-7xl flex-col px-6 py-8 sm:px-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-kumo-default">Context &amp; Skills</h1>
        <p className="mt-2 text-sm text-kumo-subtle">Bily operating context and {BILY_LIBRARY.entries.filter((e) => e.kind === 'skill').length} reusable skills. Choose a skill to inspect its instructions and start a workspace.</p>
      </header>
      <div className="mb-4 flex flex-wrap gap-3">
        <label className="relative min-w-52 flex-1">
          <MagnifyingGlass size={16} className="absolute left-3 top-3 text-kumo-subtle" />
          <input type="search" aria-label="Search skills" placeholder="Find a skill or workflow…" value={query} onChange={(e) => setQuery(e.target.value)} className="w-full rounded-lg border border-kumo-line bg-kumo-base py-2 pl-9 pr-3 text-sm text-kumo-default" />
        </label>
        <select aria-label="Skill category" value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-kumo-line bg-kumo-base px-3 text-sm text-kumo-default">
          {categories.map((item) => <option key={item}>{item}</option>)}
        </select>
      </div>
      <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <section aria-label="Bily library" className="max-h-72 overflow-auto rounded-xl border border-kumo-line p-2 lg:max-h-none">
          {entries.length === 0 && <p className="p-4 text-sm text-kumo-subtle">No skills match this search.</p>}
          {entries.map((entry) => (
            <button key={entry.id} type="button" aria-pressed={entry.id === selectedId} onClick={() => { setSelectedId(entry.id); setCopyMessage('') }} className={`mb-1 flex w-full gap-3 rounded-lg p-3 text-left ${entry.id === selectedId ? 'bg-kumo-tint' : 'hover:bg-kumo-elevated'}`}>
              {entry.kind === 'context' ? <BookOpen size={18} className="mt-0.5 shrink-0 text-kumo-subtle" /> : <Sparkle size={18} className="mt-0.5 shrink-0 text-kumo-subtle" />}
              <span><span className="block text-sm font-medium text-kumo-default">{entry.title}</span><span className="mt-1 block text-xs text-kumo-subtle">{entry.category} · {entry.executor === 'codex' ? 'Codex executor' : 'Workspace'}</span></span>
            </button>
          ))}
        </section>
        <article key={selected.id} className="min-w-0 overflow-auto rounded-xl border border-kumo-line bg-kumo-base p-5 sm:p-7">
          <p className="text-xs text-kumo-subtle">{selected.category} · {selected.kind === 'context' ? 'Company context' : 'Reusable skill'}</p>
          <h2 className="mt-2 text-xl font-semibold text-kumo-default">{selected.title}</h2>
          <p className="mt-2 text-sm leading-6 text-kumo-subtle">{selected.summary}</p>
          <div className="my-5 flex flex-wrap items-center gap-3">
            <Link to="/" search={{ prompt }} className="inline-flex items-center gap-2 rounded-lg bg-kumo-brand px-4 py-2 text-sm font-medium text-white hover:bg-kumo-brand-hover">Use in workspace <ArrowUpRight size={15} /></Link>
            <button type="button" className="rounded-lg border border-kumo-line px-3 py-2 text-sm text-kumo-default" onClick={() => { void navigator.clipboard.writeText(selected.instructions).then(() => setCopyMessage('Instructions copied.'), () => setCopyMessage('Copy unavailable. Select the instructions below.')) }}>Copy instructions</button>
            <span role="status" className="text-xs text-kumo-subtle">{copyMessage}</span>
          </div>
          <section className="mb-6 rounded-lg bg-kumo-elevated p-4 text-sm text-kumo-subtle">
            <h3 className="font-medium text-kumo-default">Required to apply this skill</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5">{selected.requirements.map((requirement) => <li key={requirement}>{requirement}</li>)}</ul>
            {selected.executor === 'codex' && <p className="mt-3">This recipe runs through a connected Codex executor. Adding it to the library does not install its tools.</p>}
          </section>
          <div className="prose prose-sm max-w-none break-words text-kumo-default [&_a]:text-kumo-link [&_pre]:overflow-auto [&_pre]:whitespace-pre-wrap [&_pre]:rounded-lg [&_pre]:bg-kumo-elevated [&_pre]:p-3"><Markdown>{selected.instructions.replace(/^---\n[\s\S]*?\n---\n/, '')}</Markdown></div>
          <footer className="mt-7 border-t border-kumo-line pt-4 text-xs text-kumo-subtle">
            <p>{selected.source} · Reviewed {BILY_LIBRARY.reviewedAt} · Library {BILY_LIBRARY.version}</p>
            <p className="mt-1 break-all font-mono">SHA-256 {selected.sha256}</p>
          </footer>
        </article>
      </div>
    </div>
  )
}
