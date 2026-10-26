import { createRoot } from 'react-dom/client'
import { OutreachDeck } from './OutreachDeck'
import '../styles.css'

// Development-only entry. The production Vite build has index.html as its sole entry.
document.documentElement.classList.add('dark')
createRoot(document.getElementById('outreach-preview')!).render(<main className="min-h-screen bg-kumo-base px-4 py-7 text-kumo-default sm:px-10"><div className="mx-auto max-w-5xl"><p className="mb-5 text-xs text-kumo-subtle">LOCAL PREVIEW · Delivery is simulated</p><h1 className="text-2xl font-semibold">Outreach approvals</h1><p className="mt-2 text-sm text-kumo-subtle">One store at a time. Review the relationship, choose the next step.</p><OutreachDeck /></div></main>)
