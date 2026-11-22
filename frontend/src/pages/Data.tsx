import clsx from 'clsx'
import { FileSpreadsheet, Lock, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api, type CatalogRaw, type Job } from '../api'
import { go } from '../App'
import { Arrow, C, Mascot, Sticker } from '../components/brand'
import { AnswerPanel, IngestPanel, PrivacyPanel, QualityPanel, SchemaPanel } from '../components/dataviews'
import { Term } from '../components/gloss'
import { ErrorNote, Toggle, sensitivityClass } from '../components/ui'
import { useStore } from '../store'

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'none']
const LEVELS = ['public', 'internal', 'confidential', 'restricted']
const slug = (s: string) => s.toLowerCase().replace(/\.[^.]+$/, '').replace(/\W+/g, '_').replace(/^_|_$/g, '')
type Tab = 'health' | 'links' | 'privacy' | 'answers' | 'catalogue' | 'log' | 'add'

export default function Data() {
  const { dataset } = useStore()
  const [chosen, setChosen] = useState<Tab | null>(null)   // the analyst's pick; until then follow whether data exists
  const tab: Tab = chosen ?? (dataset ? 'health' : 'add')
  const setTab = (t: Tab) => setChosen(t)
  const [catVersion, setCatVersion] = useState(0)
  const tabs: [Tab, string][] = [['health', 'Health'], ['links', 'Relationships'], ['privacy', 'Privacy scan'],
    ...(dataset?.incidents ? [['answers', `Answer key · ${dataset.incidents}`] as [Tab, string]] : []),
    ['catalogue', 'Catalogue'], ['log', 'Ingest log'], ['add', '+ Add data']]
  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[26px] bg-blush px-5 pb-8 pt-8 sm:px-9">
        <Sticker r={-4} className="bg-ink text-paper">Data &amp; catalogue</Sticker>
        <h1 className="display mt-5 max-w-4xl text-[clamp(44px,6.4vw,96px)] text-paper">Your data, handled carefully.</h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink">
          Bring files of any size, connect a database, or generate ShopSim, a 3.8-million-row shop with eight planted problems.
          Code checks quality, finds personal data by reading values, maps how tables link, and logs every cleaning step.
          The AI sees only the schema and labels.
        </p>
        {dataset && (
          <div className="mt-6 flex flex-wrap gap-2 font-label text-[10.5px] font-bold uppercase tracking-[0.06em]">
            <span className="rounded-[8px] bg-ink px-3 py-1.5 text-paper">{dataset.label}</span>
            <span className="rounded-[8px] bg-paper px-3 py-1.5 text-ink">{dataset.tables} tables</span>
            <span className="rounded-[8px] bg-paper px-3 py-1.5 text-ink">{dataset.columns} columns</span>
            <span className="rounded-[8px] bg-scarlet px-3 py-1.5 text-paper">{dataset.sensitive} sensitive</span>
            {dataset.generated && <span className="rounded-[8px] bg-mustard px-3 py-1.5 text-ink">{(dataset.generated.rows / 1e6).toFixed(2)}M rows</span>}
            {!!dataset.incidents && <span className="rounded-[8px] bg-oxblood px-3 py-1.5 text-paper">{dataset.incidents} known incidents</span>}
          </div>
        )}
        <Mascot size={170} mood="happy" head={C.paper} className="absolute -right-6 bottom-2 hidden rotate-[-10deg] animate-bob lg:block" />
      </section>

      <nav className="sticky top-[76px] z-20 flex gap-1.5 overflow-x-auto rounded-[14px] bg-paper/90 p-1.5 backdrop-blur">
        {tabs.map(([id, l]) => (
          <button key={id} onClick={() => setTab(id)} disabled={!dataset && id !== 'add'}
            className={clsx('shrink-0 rounded-[9px] px-3.5 py-2 font-label text-[10.5px] font-bold uppercase tracking-[0.06em] transition disabled:opacity-30',
              tab === id ? 'bg-ink text-paper' : id === 'add' ? 'bg-mustard text-ink hover:bg-ink hover:text-paper' : 'bg-surface text-ink hover:bg-blush')}>{l}</button>
        ))}
      </nav>

      <section className="card p-4 sm:p-6" key={`${tab}-${dataset?.name}-${catVersion}`}>
        {tab === 'add' && <AddData onDone={() => setTab('health')} />}
        {dataset && tab === 'health' && <QualityPanel ds={dataset.name} />}
        {dataset && tab === 'links' && <SchemaPanel ds={dataset.name} />}
        {dataset && tab === 'privacy' && <PrivacyPanel ds={dataset.name} onChanged={() => setCatVersion(v => v + 1)} />}
        {dataset && tab === 'answers' && <AnswersRoute ds={dataset.name} />}
        {dataset && tab === 'catalogue' && <CatalogEditor />}
        {dataset && tab === 'log' && <IngestPanel ds={dataset.name} />}
      </section>
    </div>
  )
}

function AnswersRoute({ ds }: { ds: string }) {
  const { setDraftProblem, setMode } = useStore()
  return <AnswerPanel ds={ds} onPick={p => { setDraftProblem(p); setMode('C'); go('investigate') }} />
}

/* ------------------------------------------------------------------ jobs */

function useJob(onDone: (j: Job) => void) {
  const [job, setJob] = useState<Job | null>(null)
  const timer = useRef<number | null>(null)
  const track = (id: string) => {
    if (timer.current) clearInterval(timer.current)
    timer.current = window.setInterval(async () => {
      try {
        const j = await api.job(id)
        setJob(j)
        if (j.status !== 'running') { clearInterval(timer.current!); timer.current = null; if (j.status === 'done') onDone(j) }
      } catch { /* keep polling */ }
    }, 700)
  }
  useEffect(() => () => { if (timer.current) clearInterval(timer.current) }, [])
  return { job, setJob, track }
}

function Progress({ frac, label, tone = C.oxblood }: { frac: number; label: string; tone?: string }) {
  return (
    <div className="mt-4">
      <div className="flex justify-between font-label text-[10.5px] font-bold uppercase tracking-[0.06em] text-ink"><span className="truncate pr-4">{label}</span><span>{Math.round(frac * 100)}%</span></div>
      <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-sunken">
        <div className="relative h-full overflow-hidden rounded-full transition-all duration-500" style={{ width: `${Math.max(2, frac * 100)}%`, background: tone }}>
          <span className="absolute inset-0 animate-[marquee_1.2s_linear_infinite] bg-[repeating-linear-gradient(45deg,transparent_0_8px,rgb(255_255_255/0.18)_8px_16px)] [width:200%]" />
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ add data */

function AddData({ onDone }: { onDone: () => void }) {
  const { model, reloadDatasets } = useStore()
  const [mode, setMode] = useState<'shopsim' | 'upload' | 'connect'>('shopsim')
  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-3">
        {([['shopsim', 'Generate ShopSim', '3.8M rows · 117 columns · 8 known problems', C.oxblood],
          ['upload', 'Upload files', 'CSV, Excel, JSON, Parquet, SQLite · big files streamed', C.ink],
          ['connect', 'Connect a database', 'PostgreSQL, MySQL, SQLite · read-only account', C.tangerine]] as const).map(([id, t, s, bg]) => (
          <button key={id} onClick={() => setMode(id)}
            className={clsx('rounded-[16px] border-2 p-4 text-left transition', mode === id ? 'border-transparent text-paper' : 'border-line bg-surface text-ink hover:border-ink')}
            style={mode === id ? { background: bg } : undefined}>
            <div className="display text-[20px]">{t}</div>
            <div className={clsx('mt-1 text-[12px]', mode === id ? 'text-paper/80' : 'text-muted')}>{s}</div>
          </button>
        ))}
      </div>
      <div className="mt-5">
        {mode === 'shopsim' && <ShopSimGen onDone={async () => { await reloadDatasets('shopsim'); onDone() }} />}
        {mode === 'upload' && <Upload model={model} onDone={async ds => { await reloadDatasets(ds); onDone() }} />}
        {mode === 'connect' && <Connect model={model} onDone={async ds => { await reloadDatasets(ds); onDone() }} />}
      </div>
    </div>
  )
}

function ShopSimGen({ onDone }: { onDone: () => void }) {
  const [scale, setScale] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const { job, setJob, track } = useJob(() => onDone())
  const start = async () => {
    setError(null)
    try { const { job: id } = await api.shopsim(scale); setJob({ id, kind: 'shopsim', status: 'running', message: 'Starting…', progress: 0, result: null, error: null }); track(id) }
    catch (e) { setError((e as Error).message) }
  }
  const rows = Math.round(3_762_000 * scale)
  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
      <div>
        <h3 className="display text-[28px] text-ink">ShopSim: a whole company, with eight known problems</h3>
        <p className="mt-2 text-[13.5px] leading-relaxed text-fg-2">
          The synthetic enterprise from the project synopsis: customers, products, orders, payments, 2.5 million website sessions,
          campaigns, support tickets, deployment logs and an HR table that is only there as a trap. A year of data with weekly and festive patterns.
          Eight real-world incidents are planted, one per month, so every investigation has a right answer to check against.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[['9', 'tables'], ['117', 'columns'], ['8', 'incidents']].map(([n, l]) => (
            <div key={l} className="rounded-[12px] bg-sunken py-2.5"><div className="font-display text-[24px] text-ink">{n}</div><div className="font-label text-[9px] uppercase text-muted">{l}</div></div>
          ))}
        </div>
      </div>
      <div className="rounded-[18px] bg-ink p-5 text-paper">
        <div className="font-label text-[10px] font-bold uppercase tracking-[0.12em] text-blush">Size</div>
        <input type="range" min={0.05} max={1} step={0.05} value={scale} onChange={e => setScale(Number(e.target.value))} className="mt-3 w-full accent-[#efc415]" />
        <div className="mt-1 flex justify-between font-mono text-[12px]"><span>{Math.round(scale * 100)}% of full size</span><span className="text-mustard">≈ {(rows / 1e6).toFixed(2)}M rows</span></div>
        <p className="mt-3 text-[12px] text-paper/60">Full size takes about 20–60 seconds and about 700 MB on disk. It replaces any earlier ShopSim.</p>
        <button onClick={start} disabled={job?.status === 'running'}
          className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-[12px] bg-mustard font-label text-[12px] font-bold uppercase tracking-[0.08em] text-ink shadow-[0_4px_0_rgb(0_0_0/0.3)] disabled:opacity-60">
          {job?.status === 'running' ? 'Generating…' : 'Generate ShopSim'}
        </button>
        {job && <Progress frac={job.progress} label={job.status === 'error' ? 'Failed' : job.message} tone={C.mustard} />}
        {job?.status === 'done' && <p className="mt-3 text-[13px] text-mustard">Ready in {job.seconds}s and selected. Open the Answer key tab to start.</p>}
        {(error || job?.error) && <div className="mt-3"><ErrorNote error={error ?? job!.error!} /></div>}
      </div>
    </div>
  )
}

function Upload({ model, onDone }: { model: string; onDone: (ds: string) => void }) {
  const [files, setFiles] = useState<File[]>([])
  const [drag, setDrag] = useState(false)
  const [name, setName] = useState('')
  const [label, setLabel] = useState('')
  const [currency, setCurrency] = useState('INR')
  const [describe, setDescribe] = useState(true)
  const [sent, setSent] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const { job, setJob, track } = useJob(j => onDone(j.result.dataset))
  const total = files.reduce((a, f) => a + f.size, 0)

  const addFiles = (list: FileList | null) => {
    if (!list) return
    const next = [...files, ...Array.from(list)]
    setFiles(next)
    if (!name && next[0]) { setName(slug(next[0].name)); setLabel(next[0].name.replace(/\.[^.]+$/, '')) }
  }
  const submit = async () => {
    setError(null); setSent(0); setJob(null)
    const form = new FormData()
    files.forEach(f => form.append('files', f))
    form.append('name', name); form.append('label', label || name); form.append('currency', currency)
    form.append('describe', String(describe)); form.append('model', model)
    try {
      const { job: id } = await api.uploadStream(form, setSent)
      setSent(1)
      setJob({ id, kind: 'upload', status: 'running', message: 'Queued', progress: 0, result: null, error: null }); track(id)
    } catch (e) { setError((e as Error).message); setSent(null) }
  }
  const busy = (sent != null && sent < 1) || job?.status === 'running'
  return (
    <div>
      <div onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files) }} onClick={() => input.current?.click()}
        className={clsx('cursor-pointer rounded-[18px] border-2 border-dashed px-6 py-12 text-center transition',
          drag ? 'scale-[1.01] border-oxblood bg-blush/30' : 'border-line-strong bg-sunken/50 hover:border-ink')}>
        <input ref={input} type="file" multiple hidden onChange={e => addFiles(e.target.files)}
          accept=".csv,.tsv,.txt,.xlsx,.xls,.json,.jsonl,.ndjson,.parquet,.db,.sqlite,.sqlite3" />
        <div className="display text-[26px] text-ink">{drag ? 'Let go!' : 'Drop files here'}</div>
        <div className="mt-1 text-[13px] text-muted">or click to browse · CSV · TSV · Excel (every sheet) · JSON · JSONL · Parquet · SQLite · up to 500 MB each</div>
        <div className="mt-1 text-[12px] text-muted">Files over 40 MB are streamed to disk and loaded in 200,000-row chunks, so size is limited by disk, not memory.</div>
        {files.length > 0 && (
          <div className="mt-5 flex flex-wrap justify-center gap-2" onClick={e => e.stopPropagation()}>
            {files.map((f, i) => (
              <span key={i} className="flex items-center gap-2 rounded-[10px] bg-ink px-3 py-1.5 text-[12px] text-paper">
                <FileSpreadsheet className="h-3.5 w-3.5 text-mustard" />{f.name}<span className="text-paper/50">{(f.size / 1e6).toFixed(1)} MB</span>
                <X className="h-3.5 w-3.5 cursor-pointer text-paper/60 hover:text-paper" onClick={() => setFiles(files.filter((_, j) => j !== i))} />
              </span>))}
          </div>)}
      </div>
      <Fields {...{ name, setName, label, setLabel, currency, setCurrency, describe, setDescribe }} />
      <div className="mt-4 flex justify-end">
        <Go onClick={submit} disabled={!name || !files.length || busy}>{busy ? 'Working…' : `Create dataset${total ? ` · ${(total / 1e6).toFixed(1)} MB` : ''}`}</Go>
      </div>
      {sent != null && <Progress frac={sent} label={sent < 1 ? 'Uploading (streamed to disk)' : 'Uploaded'} tone={C.ink} />}
      {job && <Progress frac={job.progress} label={job.status === 'error' ? 'Failed' : job.message} />}
      {(error || job?.error) && <div className="mt-3"><ErrorNote error={error ?? job!.error!} /></div>}
    </div>
  )
}

function Connect({ model, onDone }: { model: string; onDone: (ds: string) => void }) {
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [label, setLabel] = useState('')
  const [currency, setCurrency] = useState('INR')
  const [describe, setDescribe] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async () => {
    setBusy(true); setError(null)
    try { onDone((await api.connect({ name, label: label || name, url, currency, describe, model })).dataset) }
    catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div>
      <div className="label">Database URL</div>
      <input className="input font-mono text-xs" type="password" value={url} onChange={e => setUrl(e.target.value)}
        placeholder="postgresql+psycopg://readonly_user:password@host:5432/dbname" />
      <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-muted"><Lock className="h-3 w-3" />
        The URL is stored in .env (owner-only), never in datasets.yaml. Use an account with read-only rights.</p>
      <Fields {...{ name, setName, label, setLabel, currency, setCurrency, describe, setDescribe }} />
      <div className="mt-4 flex justify-end"><Go onClick={submit} disabled={!name || !url || busy}>{busy ? 'Connecting…' : 'Connect'}</Go></div>
      {error && <div className="mt-3"><ErrorNote error={error} /></div>}
    </div>
  )
}

function Fields(p: { name: string; setName: (v: string) => void; label: string; setLabel: (v: string) => void; currency: string; setCurrency: (v: string) => void; describe: boolean; setDescribe: (v: boolean) => void }) {
  return (
    <>
      <div className="mt-5 grid gap-4 md:grid-cols-[1fr_1.5fr_140px]">
        <div><div className="label">Short name</div><input className="input" value={p.name} onChange={e => p.setName(slug(e.target.value))} placeholder="sales_2025" /></div>
        <div><div className="label">Display name</div><input className="input" value={p.label} onChange={e => p.setLabel(e.target.value)} placeholder="Sales 2025" /></div>
        <div><div className="label">Currency</div>
          <select className="input" value={p.currency} onChange={e => p.setCurrency(e.target.value)}>{CURRENCIES.map(c => <option key={c}>{c}</option>)}</select></div>
      </div>
      <div className="mt-4"><Toggle checked={p.describe} onChange={p.setDescribe} label="Let the AI draft column descriptions (only names and non-sensitive samples are sent)" /></div>
    </>
  )
}

function Go({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="group flex h-11 items-center gap-2 rounded-[12px] bg-ink px-6 font-label text-[11.5px] font-bold uppercase tracking-[0.08em] text-paper shadow-[0_4px_0_var(--color-oxblood)] transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-45">
      {children} <Arrow className="h-3.5 w-3.5 transition-transform group-hover:rotate-45" />
    </button>
  )
}

/* ------------------------------------------------------------------ catalogue */

function CatalogEditor() {
  const { dataset, model, reloadDatasets } = useStore()
  const [cat, setCat] = useState<CatalogRaw | null>(null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState<'save' | 'refresh' | 'delete' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    if (!dataset) return
    setCat(null); setDirty(false)
    api.catalog(dataset.name).then(setCat).catch(e => setError((e as Error).message))
  }, [dataset])
  if (!dataset) return null
  const update = (t: string, c: string, patch: Partial<{ sensitivity: string; description: string }>) => {
    setCat(prev => prev && ({ ...prev, tables: { ...prev.tables, [t]: { ...prev.tables[t],
      columns: { ...prev.tables[t].columns, [c]: { ...prev.tables[t].columns[c], ...patch } } } } }))
    setDirty(true)
  }
  const setGate = (t: string, on: boolean) => {
    setCat(prev => prev && ({ ...prev, tables: { ...prev.tables, [t]: { ...prev.tables[t], requires_finding: on ? 'any' : null } } }))
    setDirty(true)
  }
  const act = async (kind: 'save' | 'refresh' | 'delete') => {
    setBusy(kind); setError(null)
    try {
      if (kind === 'save' && cat) { await api.saveCatalog(dataset.name, cat); setDirty(false) }
      if (kind === 'refresh') await api.refresh(dataset.name, model)
      if (kind === 'delete') { if (!confirm(`Remove "${dataset.label}" from InvestiGuard? Data files stay on disk.`)) return; await api.deleteDataset(dataset.name) }
      await reloadDatasets(kind === 'delete' ? undefined : dataset.name)
    } catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }
  const counts = cat ? LEVELS.map(l => Object.values(cat.tables).flatMap(t => Object.values(t.columns)).filter(c => c.sensitivity === l).length) : []
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="display text-[24px] text-ink">Sensitivity labels</h3>
          <p className="mt-1 text-[12.5px] text-muted">internal → readable · confidential → <Term t="count-only">count-only</Term> · restricted → never granted. The policy engine enforces whatever you set here.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => act('refresh')} disabled={!!busy} className="h-10 rounded-[10px] border-[1.5px] border-ink px-4 font-label text-[11px] font-bold uppercase text-ink hover:bg-ink hover:text-paper disabled:opacity-50">{busy === 'refresh' ? 'Profiling…' : 'Re-profile'}</button>
          <button onClick={() => act('save')} disabled={!dirty || !!busy} className="h-10 rounded-[10px] bg-ink px-4 font-label text-[11px] font-bold uppercase text-paper disabled:opacity-40">{busy === 'save' ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
      {cat && (
        <div className="mt-4 flex h-3 overflow-hidden rounded-full">
          {counts.map((n, i) => n > 0 && <span key={i} title={`${LEVELS[i]}: ${n}`} style={{ flex: n, background: [ '#cfc6be', C.blush, C.mustard, C.scarlet][i] }} />)}
        </div>
      )}
      {cat && <div className="mt-1.5 flex flex-wrap gap-3 font-label text-[9.5px] font-bold uppercase text-muted">{LEVELS.map((l, i) => <span key={l}>{l} {counts[i]}</span>)}</div>}
      {error && <div className="mt-3"><ErrorNote error={error} /></div>}
      <input className="input mt-4 max-w-sm" placeholder="Filter columns…" value={filter} onChange={e => setFilter(e.target.value)} />
      {!cat ? <div className="mt-4 h-64 animate-pulse rounded-[16px] bg-sunken" /> : (
        <div className="mt-4 space-y-3">
          {Object.entries(cat.tables).map(([t, info]) => {
            const cols = Object.entries(info.columns).filter(([c]) => c.includes(filter.toLowerCase()) || t.includes(filter.toLowerCase()))
            if (!cols.length) return null
            return (
              <div key={t} className="overflow-hidden rounded-[16px] border-[1.5px] border-line bg-surface">
                <div className="flex flex-wrap items-center gap-3 border-b-[1.5px] border-line bg-sunken/50 px-4 py-3">
                  <span className="font-mono text-[13px] font-semibold text-ink">{t}</span>
                  <span className="text-xs text-subtle">{Object.keys(info.columns).length} columns</span>
                  {info.description && <span className="hidden max-w-xl truncate text-xs text-muted lg:block">{info.description}</span>}
                  <div className="ml-auto"><Toggle checked={!!info.requires_finding} onChange={v => setGate(t, v)} label="Evidence gate (P4)" /></div>
                </div>
                <table className="w-full">
                  <thead><tr><th className="th w-56">Column</th><th className="th w-24">Type</th><th className="th w-44">Sensitivity</th><th className="th">Description</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {cols.map(([c, m]) => (
                      <tr key={c} className="hover:bg-blush/10">
                        <td className="td font-mono text-xs text-fg">{c}</td>
                        <td className="td font-mono text-[11px] text-subtle">{m.type}</td>
                        <td className="td">
                          <select value={m.sensitivity} onChange={e => update(t, c, { sensitivity: e.target.value })}
                            className={clsx('w-full cursor-pointer rounded-[6px] px-2 py-1 text-xs font-medium outline-none', sensitivityClass(m.sensitivity))}>
                            {LEVELS.map(l => <option key={l} value={l} className="bg-surface text-fg">{l}</option>)}
                          </select>
                        </td>
                        <td className="td"><input value={m.description ?? ''} onChange={e => update(t, c, { description: e.target.value })}
                          className="w-full rounded-[6px] border border-transparent bg-transparent px-2 py-1 text-xs text-fg-2 outline-none transition hover:border-line focus:border-ink focus:bg-surface" placeholder="Add a description…" /></td>
                      </tr>))}
                  </tbody>
                </table>
              </div>)
          })}
        </div>)}
      <div className="mt-6 flex items-center justify-between border-t-[1.5px] border-line pt-4">
        <span className="font-mono text-xs text-subtle">Source: {dataset.source}</span>
        <button onClick={() => act('delete')} disabled={!!busy} className="h-10 rounded-[10px] border-[1.5px] border-scarlet/50 px-4 font-label text-[11px] font-bold uppercase text-scarlet hover:bg-scarlet hover:text-paper">Remove dataset</button>
      </div>
    </div>
  )
}
