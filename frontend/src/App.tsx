import clsx from 'clsx'
import { ChevronDown, Database, GitCompareArrows, MessageSquareText, Network, ScanSearch, ShieldCheck, Sparkles } from 'lucide-react'
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { ErrorNote } from './components/ui'
import Ask from './pages/Ask'
import Compare from './pages/Compare'
import Data from './pages/Data'
import Investigate from './pages/Investigate'
import { useStore } from './store'

const HowItWorks = lazy(() => import('./pages/HowItWorks'))

type Page = 'investigate' | 'ask' | 'compare' | 'data' | 'how'
const NAV: { id: Page; label: string; icon: ReactNode; hint: string }[] = [
  { id: 'investigate', label: 'Investigate', icon: <ScanSearch className="h-4 w-4" />, hint: 'Why did a number change?' },
  { id: 'ask', label: 'Ask your data', icon: <MessageSquareText className="h-4 w-4" />, hint: 'Plain-English questions' },
  { id: 'compare', label: 'Scoped vs open', icon: <GitCompareArrows className="h-4 w-4" />, hint: 'Privilege–utility trade-off' },
  { id: 'data', label: 'Data & catalogue', icon: <Database className="h-4 w-4" />, hint: 'Upload, connect, label' },
  { id: 'how', label: 'How it works', icon: <Network className="h-4 w-4" />, hint: 'Architecture & LangGraph' },
]

const pageFromHash = (): Page => {
  const h = window.location.hash.replace('#/', '') as Page
  return NAV.some(n => n.id === h) ? h : 'investigate'
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
  const active = NAV.find(n => n.id === page)!

  return (
    <div className="flex min-h-screen">
      {/* sidebar */}
      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-r border-white/[0.06] bg-ink-950/70 backdrop-blur-xl lg:flex">
        <div className="flex items-center gap-3 px-5 pb-4 pt-6">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-400 to-cyan-400 shadow-lg shadow-indigo-500/30">
            <ShieldCheck className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="text-[17px] font-extrabold tracking-tight text-white">InvestiGuard</div>
            <div className="text-[11px] text-slate-400">Least-privilege analytics agent</div>
          </div>
        </div>

        <nav className="space-y-1 px-3 py-2">
          {NAV.map(n => (
            <button key={n.id} onClick={() => go(n.id)}
              className={clsx('group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition',
                page === n.id ? 'bg-gradient-to-r from-indigo-500/20 to-cyan-500/5 text-white ring-1 ring-indigo-400/25'
                  : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-100')}>
              <span className={clsx('grid h-8 w-8 place-items-center rounded-lg transition',
                page === n.id ? 'bg-indigo-500/25 text-indigo-200' : 'bg-white/[0.04] text-slate-400 group-hover:text-slate-200')}>
                {n.icon}
              </span>
              <span>
                <span className="block text-sm font-semibold">{n.label}</span>
                <span className="block text-[11px] text-slate-500">{n.hint}</span>
              </span>
            </button>
          ))}
        </nav>

        <div className="mt-auto space-y-4 border-t border-white/[0.06] p-5">
          <div>
            <div className="label">Access mode</div>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-white/[0.04] p-1 ring-1 ring-white/10">
              {(['C', 'A'] as const).map(m => (
                <button key={m} onClick={() => setMode(m)}
                  className={clsx('rounded-lg px-2 py-1.5 text-xs font-semibold transition',
                    mode === m ? (m === 'C' ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/30'
                      : 'bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/30') : 'text-slate-400 hover:text-slate-200')}>
                  {m === 'C' ? 'Scoped' : 'Unrestricted'}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-slate-500">
              {mode === 'C' ? 'Each hypothesis gets only the columns it needs.' : 'Baseline for comparison: every column is open.'}
            </p>
          </div>
          <div>
            <div className="label">Model</div>
            <input className="input py-2 font-mono text-xs" value={model} onChange={e => setModel(e.target.value)} />
          </div>
        </div>
      </aside>

      {/* main */}
      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-ink-950/70 backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1400px] items-center gap-4 px-6 py-3.5">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-500">{active.icon}</span>
              <span className="font-semibold text-slate-100">{active.label}</span>
            </div>
            <div className="ml-auto flex items-center gap-3">
              {dataset && (
                <div className="hidden items-center gap-2 md:flex">
                  <Pill>{dataset.tables} tables</Pill>
                  <Pill>{dataset.columns} columns</Pill>
                  <Pill tone="warn">{dataset.sensitive} sensitive</Pill>
                </div>
              )}
              <div className="relative">
                <Database className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-300" />
                <select value={dataset?.name ?? ''} onChange={e => setDataset(e.target.value)}
                  className="input w-72 appearance-none py-2 pl-9 pr-9 font-medium">
                  {datasets.map(d => <option key={d.name} value={d.name}>{d.label}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
            </div>
          </div>
          <div className="flex gap-1 overflow-x-auto px-4 pb-2 lg:hidden">
            {NAV.map(n => (
              <button key={n.id} onClick={() => go(n.id)}
                className={clsx('flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold',
                  page === n.id ? 'bg-indigo-500/20 text-white' : 'text-slate-400')}>
                {n.icon}{n.label}
              </button>
            ))}
          </div>
        </header>

        <div className="mx-auto max-w-[1400px] px-6 py-6">
          {loadError && <div className="mb-6"><ErrorNote error={loadError} /></div>}
          {!dataset && !loadError && page !== 'data' && page !== 'how' ? (
            <div className="card flex flex-col items-center p-12 text-center">
              <Sparkles className="mb-3 h-8 w-8 text-indigo-300" />
              <div className="text-lg font-semibold text-white">Add your first dataset</div>
              <p className="mt-1 text-sm text-slate-400">Upload a CSV, Excel, JSON or Parquet file, or connect a database.</p>
              <button onClick={() => go('data')} className="mt-4 text-sm font-semibold text-indigo-300 hover:text-indigo-200">Go to Data →</button>
            </div>
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

function Pill({ children, tone }: { children: ReactNode; tone?: 'warn' }) {
  return (
    <span className={clsx('rounded-full px-2.5 py-1 text-[11px] font-medium ring-1',
      tone === 'warn' ? 'bg-amber-500/10 text-amber-200 ring-amber-500/20' : 'bg-white/[0.04] text-slate-300 ring-white/10')}>
      {children}
    </span>
  )
}
