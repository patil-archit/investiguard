import clsx from 'clsx'
import { BookOpen, ChevronsUpDown, Database, GitCompareArrows, MessageSquareText, ScanSearch } from 'lucide-react'
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { Empty, ErrorNote, Segmented } from './components/ui'
import Ask from './pages/Ask'
import Compare from './pages/Compare'
import Data from './pages/Data'
import Investigate from './pages/Investigate'
import { useStore } from './store'

const HowItWorks = lazy(() => import('./pages/HowItWorks'))

type Page = 'investigate' | 'ask' | 'compare' | 'data' | 'how'
const NAV: { id: Page; label: string; icon: ReactNode }[] = [
  { id: 'investigate', label: 'Investigate', icon: <ScanSearch className="h-4 w-4" /> },
  { id: 'ask', label: 'Ask your data', icon: <MessageSquareText className="h-4 w-4" /> },
  { id: 'compare', label: 'InvestiGuard vs AI', icon: <GitCompareArrows className="h-4 w-4" /> },
  { id: 'data', label: 'Data & catalogue', icon: <Database className="h-4 w-4" /> },
  { id: 'how', label: 'How it works', icon: <BookOpen className="h-4 w-4" /> },
]

const pageFromHash = (): Page => {
  const h = window.location.hash.replace('#/', '') as Page
  return NAV.some(n => n.id === h) ? h : 'investigate'
}

function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="14" fill="#1b1a18" />
      <path d="M32 14l14 5.5v10.5c0 9.6-6 16.8-14 20-8-3.2-14-10.4-14-20V19.5z" fill="none" stroke="#f6f5f2" strokeWidth="3.5" strokeLinejoin="round" />
      <circle cx="32" cy="31" r="4" fill="#5fb3c9" />
    </svg>
  )
}

export default function App() {
  const { datasets, dataset, setDataset, mode, setMode, model, setModel, loadError } = useStore()
  const [page, setPage] = useState<Page>(pageFromHash)
  useEffect(() => {
    const on = () => setPage(pageFromHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const go = (p: Page) => { window.location.hash = `/${p}`; setPage(p) }

  return (
    <div className="flex min-h-screen">
      {/* sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-canvas lg:flex">
        <div className="flex items-center gap-2.5 px-5 pb-6 pt-5">
          <Logo className="h-7 w-7" />
          <div className="leading-tight">
            <div className="text-[15px] font-semibold tracking-tight text-fg">InvestiGuard</div>
            <div className="text-[11px] text-subtle">Least-privilege analytics</div>
          </div>
        </div>

        <div className="eyebrow px-5 pb-2">Workspace</div>
        <nav className="space-y-0.5 px-3">
          {NAV.map(n => (
            <button key={n.id} onClick={() => go(n.id)}
              className={clsx('flex w-full items-center gap-2.5 rounded-md px-2.5 py-[7px] text-left text-[13.5px] transition',
                page === n.id ? 'bg-surface font-medium text-fg shadow-[0_0_0_1px_var(--color-line),0_1px_2px_rgb(27_26_24/0.05)]'
                  : 'text-muted hover:bg-sunken hover:text-fg')}>
              <span className={page === n.id ? 'text-accent' : 'text-subtle'}>{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>

        <div className="mt-auto space-y-5 border-t border-line px-5 py-5">
          <div>
            <div className="label">Mode</div>
            <Segmented value={mode} onChange={setMode}
              options={[{ id: 'C', label: 'InvestiGuard' }, { id: 'A', label: 'Direct AI' }]} />
            <p className="mt-2 flex items-start gap-1.5 text-[11.5px] leading-snug text-muted">
              <span className={clsx('mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full', mode === 'C' ? 'bg-good' : 'bg-bad')} />
              {mode === 'C' ? 'Tests hypotheses one by one, each with only the columns it needs.' : 'Baseline: the AI looks for the reason itself, with every column open and no checks.'}
            </p>
          </div>
          <div>
            <div className="label">Model</div>
            <input className="input h-8 py-1 font-mono text-xs" value={model} onChange={e => setModel(e.target.value)} />
          </div>
        </div>
      </aside>

      {/* main */}
      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur-md">
          <div className="mx-auto flex max-w-[1280px] items-center gap-4 px-8 py-3">
            <div className="flex items-center gap-2 lg:hidden"><Logo className="h-6 w-6" /><span className="text-sm font-semibold">InvestiGuard</span></div>
            {dataset && (
              <div className="hidden items-center gap-3 text-xs text-muted md:flex">
                <span>{dataset.tables} tables</span><span className="text-line-strong">/</span>
                <span>{dataset.columns} columns</span><span className="text-line-strong">/</span>
                <span className="text-warn">{dataset.sensitive} sensitive</span>
              </div>
            )}
            <div className="relative ml-auto">
              <Database className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
              <select value={dataset?.name ?? ''} onChange={e => setDataset(e.target.value)}
                className="input h-8 w-72 appearance-none py-1 pl-8 pr-8 text-[13px] font-medium">
                {datasets.map(d => <option key={d.name} value={d.name}>{d.label}</option>)}
              </select>
              <ChevronsUpDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
            </div>
          </div>
          <div className="flex gap-1 overflow-x-auto px-4 pb-2 lg:hidden">
            {NAV.map(n => (
              <button key={n.id} onClick={() => go(n.id)}
                className={clsx('flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium',
                  page === n.id ? 'bg-surface text-fg shadow-[0_0_0_1px_var(--color-line)]' : 'text-muted')}>
                {n.icon}{n.label}
              </button>
            ))}
          </div>
        </header>

        <div className="mx-auto max-w-[1280px] px-8 py-8">
          {loadError && <div className="mb-6"><ErrorNote error={loadError} /></div>}
          {!dataset && !loadError && page !== 'data' && page !== 'how' ? (
            <Empty icon={<Database className="h-6 w-6" />} title="Add your first dataset"
              text="Upload a CSV, Excel, JSON or Parquet file, or connect a database, from the Data & catalogue page." />
          ) : (
            <div key={page} className="animate-fade-in">
              {page === 'investigate' && <Investigate />}
              {page === 'ask' && <Ask />}
              {page === 'compare' && <Compare />}
              {page === 'data' && <Data />}
              {page === 'how' && <Suspense fallback={<div className="card h-96 animate-pulse" />}><HowItWorks /></Suspense>}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
