import clsx from 'clsx'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Arrow, C, Cursor, Logo, Mascot, Preloader } from './components/brand'
import { Empty, ErrorNote, Segmented, Toggle } from './components/ui'
import Ask from './pages/Ask'
import Benchmark from './pages/Benchmark'
import Compare from './pages/Compare'
import Data from './pages/Data'
import Investigate from './pages/Investigate'
import Landing from './pages/Landing'
import { useStore } from './store'

const HowItWorks = lazy(() => import('./pages/HowItWorks'))
const About = lazy(() => import('./pages/About'))

type AppPage = 'investigate' | 'ask' | 'compare' | 'benchmark' | 'data' | 'how'
export type Page = 'home' | 'about' | AppPage
const APP_NAV: { id: AppPage; label: string }[] = [
  { id: 'investigate', label: 'Investigate' },
  { id: 'ask', label: 'Ask' },
  { id: 'compare', label: 'Vs AI' },
  { id: 'benchmark', label: 'Benchmark' },
  { id: 'data', label: 'Data' },
  { id: 'how', label: 'How it works' },
]
const SITE_NAV: { id: Page; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'about', label: 'Our story' },
  { id: 'how', label: 'How it works' },
  { id: 'benchmark', label: 'Benchmark' },
]
const ALL: Page[] = ['home', 'about', ...APP_NAV.map(n => n.id)]

const pageFromHash = (): Page => {
  const h = window.location.hash.replace(/^#\/?/, '') as Page
  return ALL.includes(h) ? h : 'home'
}

export const go = (p: Page) => { window.location.hash = p === 'home' ? '/' : `/${p}` }

export default function App() {
  const { loadError, dataset } = useStore()
  const [page, setPage] = useState<Page>(pageFromHash)
  const [loading, setLoading] = useState(() => { try { return !sessionStorage.getItem('ig.loaded') } catch { return true } })
  useEffect(() => {
    const on = () => { setPage(pageFromHash()); window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const done = useCallback(() => { setLoading(false); try { sessionStorage.setItem('ig.loaded', '1') } catch { /* private mode */ } }, [])
  const site = page === 'home' || page === 'about'

  return (
    <div className="min-h-screen">
      <Cursor />
      {loading && <Preloader onDone={done} />}
      <Toolbar page={page} site={site} />

      {site ? (
        <div key={page}>
          {page === 'home' ? <Landing /> : <Suspense fallback={<div className="h-screen bg-oxblood" />}><About /></Suspense>}
          <Footer />
        </div>
      ) : (
        <>
          <main className="mx-auto max-w-[1320px] px-4 pb-16 pt-28 sm:px-8">
            {loadError && <div className="mb-6"><ErrorNote error={loadError} /></div>}
            {!dataset && !loadError && page !== 'data' && page !== 'how' && page !== 'benchmark' ? (
              <Empty title="Add your first dataset"
                text="Upload a CSV, Excel, JSON or Parquet file, or connect a database, from the Data page." />
            ) : (
              <div key={page} className="animate-fade-in">
                {page === 'investigate' && <Investigate />}
                {page === 'ask' && <Ask />}
                {page === 'compare' && <Compare />}
                {page === 'benchmark' && <Benchmark />}
                {page === 'data' && <Data />}
                {page === 'how' && <Suspense fallback={<div className="card h-96 animate-pulse" />}><HowItWorks /></Suspense>}
              </div>
            )}
          </main>
          <SlimFooter />
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ toolbar */

function Toolbar({ page, site }: { page: Page; site: boolean }) {
  const { datasets, dataset, setDataset } = useStore()
  const [open, setOpen] = useState(false)
  const [hidden, setHidden] = useState(false)
  const last = useRef(0)
  useEffect(() => setOpen(false), [page])
  useEffect(() => {
    const on = () => {
      const y = window.scrollY
      setHidden(y > 300 && y > last.current + 4)
      if (y < last.current - 4 || y < 300) setHidden(false)
      last.current = y
    }
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  const nav = site ? SITE_NAV : APP_NAV

  return (
    <header className={clsx('fixed inset-x-2 top-2 z-50 transition-transform duration-500 ease-[cubic-bezier(.2,.8,.2,1)] sm:inset-x-3 sm:top-3',
      hidden && !open && '-translate-y-[130%]')}>
      <div className="relative flex h-[58px] items-center rounded-[14px] bg-paper/95 pl-5 pr-1.5 shadow-[0_2px_0_rgb(45_42_38/0.08)] backdrop-blur">
        {/* left: pipe-separated links */}
        <nav className="hidden flex-1 items-center lg:flex">
          {nav.map((n, i) => (
            <span key={n.id} className="flex items-center">
              {i > 0 && <span className="mx-3 h-4 w-px bg-ink/50" />}
              <button onClick={() => go(n.id)}
                className={clsx('group relative font-label text-[11px] font-bold uppercase tracking-[0.06em] transition',
                  page === n.id ? 'text-oxblood' : 'text-ink hover:text-oxblood')}>
                {n.label}
                <span className={clsx('absolute -bottom-1.5 left-0 h-[2px] bg-oxblood transition-all duration-300',
                  page === n.id ? 'w-full' : 'w-0 group-hover:w-full')} />
              </button>
            </span>
          ))}
        </nav>

        {/* centre: logo */}
        <button onClick={() => go('home')} className="lg:absolute lg:left-1/2 lg:-translate-x-1/2" aria-label="InvestiGuard home">
          <Logo />
        </button>

        {/* right */}
        <div className="ml-auto flex items-center gap-1.5">
          {site ? (
            <button onClick={() => go('investigate')}
              className="group hidden h-[46px] items-center gap-2 rounded-[10px] bg-ink px-5 font-label text-[11px] font-bold uppercase tracking-[0.08em] text-paper transition hover:bg-oxblood sm:flex">
              Open the app <Arrow className="h-3.5 w-3.5 transition-transform group-hover:rotate-45" />
            </button>
          ) : (
            <label className="relative hidden h-[46px] items-center rounded-[10px] bg-ink pl-4 pr-9 text-paper transition hover:bg-oxblood sm:flex">
              <span className="mr-2 font-label text-[9.5px] font-bold uppercase tracking-[0.1em] text-blush">Data</span>
              <select value={dataset?.name ?? ''} onChange={e => setDataset(e.target.value)}
                className="max-w-[220px] appearance-none truncate bg-transparent font-label text-[11px] font-bold uppercase tracking-[0.04em] text-paper outline-none">
                {datasets.length === 0 && <option value="">No datasets</option>}
                {datasets.map(d => <option key={d.name} value={d.name} className="text-ink">{d.label}</option>)}
              </select>
              <svg viewBox="0 0 12 12" className="pointer-events-none absolute right-3.5 h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 4.5 6 7.5l3-3" /></svg>
            </label>
          )}
          <button onClick={() => setOpen(o => !o)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}
            className={clsx('grid h-[46px] w-[46px] place-items-center rounded-[10px] border-[1.5px] transition',
              open ? 'border-ink bg-ink text-paper' : 'border-blush bg-blush text-ink hover:border-ink')}>
            <span className="relative block h-3 w-4">
              <span className={clsx('absolute left-0 h-[2px] w-4 bg-current transition-all duration-300', open ? 'top-[5px] rotate-45' : 'top-0')} />
              <span className={clsx('absolute left-0 top-[5px] h-[2px] w-4 bg-current transition-all', open && 'opacity-0')} />
              <span className={clsx('absolute left-0 h-[2px] w-4 bg-current transition-all duration-300', open ? 'top-[5px] -rotate-45' : 'top-[10px]')} />
            </span>
          </button>
        </div>
      </div>
      {open && <div className="fixed inset-0 -z-10 animate-fade-in bg-ink/35 backdrop-blur-[3px]" onClick={() => setOpen(false)} />}
      {open && <Drawer page={page} site={site} />}
    </header>
  )
}

function Drawer({ page, site }: { page: Page; site: boolean }) {
  const { datasets, dataset, setDataset, mode, setMode, model, setModel, approvals, setApprovals } = useStore()
  return (
    <div className="ml-auto mt-2 grid max-h-[calc(100vh-90px)] w-full max-w-[720px] animate-[rise_.4s_cubic-bezier(.2,.8,.2,1)_both] gap-2 overflow-auto sm:grid-cols-2">
      <div className="rounded-[14px] bg-ink p-5 text-paper">
        <div className="mb-3 font-label text-[10px] font-bold uppercase tracking-[0.14em] text-blush">Go to</div>
        {[...(site ? [] : [{ id: 'home' as Page, label: 'Home' }, { id: 'about' as Page, label: 'Our story' }]), ...APP_NAV].map((n, i) => (
          <button key={n.id} onClick={() => go(n.id)}
            className={clsx('group flex w-full items-center justify-between border-b border-paper/15 py-2 text-left font-display text-[22px] uppercase transition hover:pl-2',
              page === n.id ? 'text-mustard' : 'text-paper hover:text-blush')}>
            <span><span className="mr-3 font-label text-[10px] text-paper/40">{String(i + 1).padStart(2, '0')}</span>{n.label}</span>
            <Arrow className="h-4 w-4 opacity-0 transition group-hover:opacity-100" />
          </button>
        ))}
        {site && <button onClick={() => go('about')} className="mt-3 font-label text-[11px] font-bold uppercase tracking-[0.1em] text-blush underline underline-offset-4">Read our story</button>}
      </div>
      <div className="relative overflow-hidden rounded-[14px] bg-paper p-5 shadow-[0_2px_0_rgb(45_42_38/0.08)]">
        <Mascot size={110} mood={mode === 'C' ? 'cool' : 'wow'} head={mode === 'C' ? C.blush : C.mustard}
          className="absolute -bottom-6 -right-5 rotate-[-12deg] opacity-90" />
        <div className="relative space-y-5">
          <div className="sm:hidden">
            <div className="label">Dataset</div>
            <select value={dataset?.name ?? ''} onChange={e => setDataset(e.target.value)} className="input h-9 py-1 text-[13px]">
              {datasets.map(d => <option key={d.name} value={d.name}>{d.label}</option>)}
            </select>
          </div>
          {dataset && (
            <div className="flex flex-wrap gap-1.5 font-label text-[10px] font-bold uppercase tracking-[0.06em]">
              <span className="rounded-[5px] bg-sunken px-2 py-1">{dataset.tables} tables</span>
              <span className="rounded-[5px] bg-sunken px-2 py-1">{dataset.columns} columns</span>
              <span className="rounded-[5px] bg-scarlet px-2 py-1 text-paper">{dataset.sensitive} sensitive</span>
            </div>
          )}
          <div>
            <div className="label">Mode</div>
            <Segmented value={mode} onChange={setMode} options={[{ id: 'C', label: 'InvestiGuard' }, { id: 'A', label: 'Direct AI' }]} />
            <p className="mt-2 max-w-[260px] text-[12px] leading-snug text-muted">
              {mode === 'C' ? 'Tests hypotheses one by one, each with only the columns it needs.' : 'Baseline: the AI looks for the reason itself, with every column open and no checks.'}
            </p>
          </div>
          {mode === 'C' && (
            <div className="max-w-[260px]">
              <Toggle checked={approvals} onChange={setApprovals} label="Ask me before gated access" />
              <p className="mt-1.5 text-[12px] leading-snug text-muted">When the evidence gate or a budget blocks a test, pause and let me approve it once.</p>
            </div>
          )}
          <div className="max-w-[260px]">
            <div className="label">Model</div>
            <input className="input h-9 py-1 font-mono text-xs" value={model} onChange={e => setModel(e.target.value)} />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ footers */

function Footer() {
  return (
    <footer className="p-2 sm:p-3">
      <div className="relative overflow-hidden rounded-[18px] bg-blush px-6 pb-8 pt-14 text-center">
        <Logo className="mx-auto w-max" />
        <div className="display mx-auto mt-10 max-w-5xl text-[clamp(52px,10vw,150px)] text-paper">
          See the cause.<br />Not the data.
        </div>
        <div className="mt-12 flex flex-wrap items-center justify-center gap-y-3 font-label text-[11px] font-bold uppercase tracking-[0.06em] text-ink">
          {[...SITE_NAV, { id: 'investigate' as Page, label: 'Open the app' }].map((n, i) => (
            <span key={n.id} className="flex items-center">
              {i > 0 && <span className="mx-3 h-4 w-px bg-ink/50" />}
              <button onClick={() => go(n.id)} className="hover:text-oxblood">{n.label}</button>
            </span>
          ))}
        </div>
        <div className="mt-6 font-label text-[10px] uppercase tracking-[0.12em] text-ink/60">
          InvestiGuard · AIML project-based learning · {new Date().getFullYear()}
        </div>
        <Mascot size={150} mood="wink" head={C.mustard} className="absolute -bottom-10 -left-8 hidden rotate-[18deg] md:block" />
        <Mascot size={130} mood="cool" head={C.tangerine} visor={C.oxblood} className="absolute -right-6 -top-6 hidden rotate-[-160deg] md:block" />
      </div>
    </footer>
  )
}

function SlimFooter() {
  return (
    <footer className="mx-2 mb-2 flex flex-wrap items-center justify-between gap-3 rounded-[14px] bg-blush px-5 py-4 sm:mx-3 sm:mb-3">
      <Logo />
      <span className="font-label text-[10px] font-bold uppercase tracking-[0.12em] text-ink/70">Least privilege · signed receipts · no raw PII</span>
      <button onClick={() => go('about')} className="font-label text-[11px] font-bold uppercase tracking-[0.06em] text-ink hover:text-oxblood">Our story</button>
    </footer>
  )
}
