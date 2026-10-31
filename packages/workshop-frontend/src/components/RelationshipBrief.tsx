/** Review-only alternatives; choosing a draft never turns a hypothesis into a verified incident. */
export type ReviewBrief = {
  version: 1
  preparedAt: string
  sourceCoverage: string
  selectedAngleId: string
  angles: {
    id: string
    title: string
    status: 'observed' | 'hypothesis' | 'relationship' | 'service_first'
    pitch: string
    reason: string
    impact: string
    evidence: string[]
    verify: string[]
    avoid: string[]
  }[]
  questions: string[]
  decisionGaps: string[]
  sequenceReasoning: string[]
}

const status = { observed: 'Observed · verify impact', hypothesis: 'Hypothesis · evidence needed', relationship: 'Relationship context', service_first: 'Service first' }

/** Shows each evidence-backed angle alongside the selected draft's rationale and unresolved questions. */
export function RelationshipBrief({ brief, context }: { brief?: ReviewBrief; context: string }) {
  if (!brief || brief.version !== 1 || !Array.isArray(brief.angles) || !brief.angles.length) return <p className="whitespace-pre-wrap">{context}</p>
  const selected = brief.angles.find(angle => angle.id === brief.selectedAngleId)
  return <section aria-label="Relationship and pitch options">
    <h3 className="font-medium text-kumo-default">Relationship and pitch options</h3>
    <p className="mt-2 text-sm">{selected ? `The draft leads with ${selected.title}.` : 'Review the angle used in the current draft.'} Compare the alternatives below before deciding what to send.</p>
    <p className="mt-2 text-xs leading-5">{brief.sourceCoverage}</p>
    <div className="mt-4 divide-y divide-kumo-line border-y border-kumo-line">
      {brief.angles.map(angle => <details key={angle.id} className="py-3" open={angle.id === brief.selectedAngleId}>
        <summary className="cursor-pointer text-sm text-kumo-default"><span className="font-medium">{angle.title}</span><span className="ml-2 text-xs text-kumo-subtle">{angle.id === brief.selectedAngleId ? 'Draft angle · ' : ''}{status[angle.status]}</span></summary>
        <div className="mt-3 space-y-3 pl-4 text-sm leading-6">
          <p><span className="font-medium text-kumo-default">Pitch:</span> {angle.pitch}</p>
          <p><span className="font-medium text-kumo-default">Why it could fit:</span> {angle.reason}</p>
          <p><span className="font-medium text-kumo-default">Business relevance:</span> {angle.impact}</p>
          {!!angle.evidence.length && <div><p className="font-medium text-kumo-default">Evidence and context</p><ul className="mt-1 list-disc space-y-1 pl-5">{angle.evidence.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
          {!!angle.verify.length && <div><p className="font-medium text-kumo-default">Verify before using this pitch</p><ul className="mt-1 list-disc space-y-1 pl-5">{angle.verify.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
          {!!angle.avoid.length && <div><p className="font-medium text-kumo-default">Claims to avoid</p><ul className="mt-1 list-disc space-y-1 pl-5">{angle.avoid.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
        </div>
      </details>)}
    </div>
    {!!brief.questions.length && <div className="mt-5"><h4 className="font-medium text-kumo-default">Fine-tune the message</h4><ul className="mt-2 list-disc space-y-2 pl-5 text-sm">{brief.questions.map((question, index) => <li key={index}>{question}</li>)}</ul></div>}
    {!!brief.decisionGaps.length && <div className="mt-5"><h4 className="font-medium text-kumo-default">What still needs a decision</h4><ul className="mt-2 list-disc space-y-2 pl-5 text-sm">{brief.decisionGaps.map((gap, index) => <li key={index}>{gap}</li>)}</ul></div>}
    {!!brief.sequenceReasoning.length && <details className="mt-5"><summary className="cursor-pointer font-medium text-kumo-default">Reasoning for each email</summary><ol className="mt-2 list-decimal space-y-2 pl-5 text-sm">{brief.sequenceReasoning.map((reason, index) => <li key={index}>{reason}</li>)}</ol></details>}
    <details className="mt-5"><summary className="cursor-pointer font-medium text-kumo-default">Relationship history and review notes</summary><p className="mt-3 whitespace-pre-wrap text-sm leading-6">{context}</p></details>
  </section>
}
