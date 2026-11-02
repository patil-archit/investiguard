import clsx from 'clsx'
import { CheckCircle2, CloudUpload, DatabaseZap, FileSpreadsheet, Lock, RefreshCw, Save, Table2, Trash2, Upload, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api, type CatalogRaw } from '../api'
import { Button, Card, ErrorNote, PageHeader, Segmented, SectionTitle, Toggle, sensitivityClass } from '../components/ui'
import { useStore } from '../store'

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'none']
const LEVELS = ['public', 'internal', 'confidential', 'restricted']
const slug = (s: string) => s.toLowerCase().replace(/\.[^.]+$/, '').replace(/\W+/g, '_').replace(/^_|_$/g, '')

export default function Data() {
  return (
    <div className="space-y-8">
      <PageHeader title="Data & catalogue"
        sub="Bring a dataset in any common format. It is profiled automatically; you review the sensitivity labels the policy engine enforces." />
      <AddDataset />
      <CatalogEditor />
    </div>
  )
}

function AddDataset() {
  const { model, reloadDatasets } = useStore()
  const [tab, setTab] = useState<'upload' | 'connect'>('upload')
  const [files, setFiles] = useState<File[]>([])
  const [drag, setDrag] = useState(false)
  const [name, setName] = useState('')
  const [label, setLabel] = useState('')
  const [currency, setCurrency] = useState('INR')
  const [describe, setDescribe] = useState(true)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const addFiles = (list: FileList | null) => {
    if (!list) return
    const next = [...files, ...Array.from(list)]
    setFiles(next)
    if (!name && next[0]) { setName(slug(next[0].name)); setLabel(next[0].name.replace(/\.[^.]+$/, '')) }
  }

  const submit = async () => {
    setBusy(true); setError(null); setDone(null)
    try {
      let ds: string
      if (tab === 'upload') {
        const form = new FormData()
        files.forEach(f => form.append('files', f))
        form.append('name', name); form.append('label', label || name); form.append('currency', currency)
        form.append('describe', String(describe)); form.append('model', model)
        ds = (await api.upload(form)).dataset
      } else {
        ds = (await api.connect({ name, label: label || name, url, currency, describe, model })).dataset
      }
      await reloadDatasets(ds)
      setDone(ds); setFiles([]); setName(''); setLabel(''); setUrl('')
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <section>
      <SectionTitle icon={<CloudUpload className="h-4 w-4" />} title="Add a dataset" sub="stays on this machine · only the schema and non-sensitive samples reach the AI"
        right={<Segmented value={tab} onChange={setTab} options={[{ id: 'upload', label: 'Upload files' }, { id: 'connect', label: 'Connect database' }]} />} />
      <Card className="p-6">
        {tab === 'upload' ? (
          <div onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files) }}
            onClick={() => input.current?.click()}
            className={clsx('cursor-pointer rounded-md border border-dashed px-6 py-10 text-center transition',
              drag ? 'border-accent bg-accent-soft/50' : 'border-line-strong bg-canvas hover:border-subtle')}>
            <input ref={input} type="file" multiple hidden onChange={e => addFiles(e.target.files)}
              accept=".csv,.tsv,.txt,.xlsx,.xls,.json,.jsonl,.ndjson,.parquet,.db,.sqlite,.sqlite3" />
            <Upload className="mx-auto mb-3 h-5 w-5 text-subtle" />
            <div className="text-sm font-medium text-fg">Drop files here or <span className="text-accent">browse</span></div>
            <div className="mt-1 text-xs text-muted">CSV · TSV · Excel (every sheet) · JSON · JSONL · Parquet · SQLite — up to 500 MB each</div>
            {files.length > 0 && (
              <div className="mt-4 flex flex-wrap justify-center gap-2" onClick={e => e.stopPropagation()}>
                {files.map((f, i) => (
                  <span key={i} className="flex items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs text-fg-2">
                    <FileSpreadsheet className="h-3.5 w-3.5 text-accent" />{f.name}
                    <span className="text-subtle">{(f.size / 1e6).toFixed(1)} MB</span>
                    <X className="h-3.5 w-3.5 cursor-pointer text-subtle hover:text-fg" onClick={() => setFiles(files.filter((_, j) => j !== i))} />
                  </span>))}
              </div>)}
          </div>
        ) : (
          <div>
            <div className="label">Database URL</div>
            <input className="input font-mono text-xs" type="password" value={url} onChange={e => setUrl(e.target.value)}
              placeholder="postgresql+psycopg://readonly_user:password@host:5432/dbname" />
            <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-muted"><Lock className="h-3 w-3" />
              Stored in .env (not datasets.yaml). Use an account with read-only rights.</p>
          </div>
        )}

        <div className="mt-5 grid gap-4 md:grid-cols-[1fr_1.5fr_140px]">
          <div><div className="label">Short name</div><input className="input" value={name} onChange={e => setName(slug(e.target.value))} placeholder="sales_2025" /></div>
          <div><div className="label">Display name</div><input className="input" value={label} onChange={e => setLabel(e.target.value)} placeholder="Sales 2025" /></div>
          <div><div className="label">Currency</div>
            <select className="input" value={currency} onChange={e => setCurrency(e.target.value)}>{CURRENCIES.map(c => <option key={c}>{c}</option>)}</select></div>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5">
          <Toggle checked={describe} onChange={setDescribe} label="Let the AI draft column descriptions (sensitive values never sent)" />
          <Button onClick={submit} loading={busy} disabled={!name || (tab === 'upload' ? files.length === 0 : !url)}>
            {tab === 'upload' ? <><CloudUpload className="h-4 w-4" /> Create dataset</> : <><DatabaseZap className="h-4 w-4" /> Connect</>}
          </Button>
        </div>
        {busy && <p className="mt-3 text-xs text-muted">Loading, labelling sensitivity, drafting descriptions, profiling changes… this can take a minute.</p>}
        {error && <div className="mt-4"><ErrorNote error={error} /></div>}
        {done && <div className="mt-4 flex items-center gap-2 rounded-md border border-good/25 bg-good-soft px-4 py-3 text-sm text-good">
          <CheckCircle2 className="h-4 w-4" /><b className="font-semibold">{done}</b> is ready and selected. Review the sensitivity labels below.</div>}
      </Card>
    </section>
  )
}

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

  return (
    <section>
      <SectionTitle icon={<Table2 className="h-4 w-4" />} title={`Catalogue · ${dataset.label}`}
        sub="internal → readable · confidential → COUNT-only · restricted → never granted"
        right={<div className="flex gap-2">
          <Button variant="secondary" onClick={() => act('refresh')} loading={busy === 'refresh'}><RefreshCw className="h-4 w-4" /> Re-profile</Button>
          <Button onClick={() => act('save')} loading={busy === 'save'} disabled={!dirty}><Save className="h-4 w-4" /> Save</Button>
        </div>} />
      {error && <div className="mb-4"><ErrorNote error={error} /></div>}
      <input className="input mb-4 max-w-sm" placeholder="Filter columns…" value={filter} onChange={e => setFilter(e.target.value)} />
      {!cat ? <div className="h-64 animate-pulse rounded-lg bg-sunken" /> : (
        <div className="space-y-4">
          {Object.entries(cat.tables).map(([t, info]) => {
            const cols = Object.entries(info.columns).filter(([c]) => c.includes(filter.toLowerCase()) || t.includes(filter.toLowerCase()))
            if (!cols.length) return null
            return (
              <Card key={t} className="overflow-hidden">
                <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
                  <span className="font-mono text-[13px] font-medium text-fg">{t}</span>
                  <span className="text-xs text-subtle">{Object.keys(info.columns).length} columns</span>
                  {info.description && <span className="hidden max-w-xl truncate text-xs text-muted lg:block">{info.description}</span>}
                  <div className="ml-auto"><Toggle checked={!!info.requires_finding} onChange={v => setGate(t, v)} label="Evidence gate (P4)" /></div>
                </div>
                <table className="w-full">
                  <thead className="border-b border-line"><tr><th className="th w-56">Column</th><th className="th w-24">Type</th><th className="th w-44">Sensitivity</th><th className="th">Description</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {cols.map(([c, m]) => (
                      <tr key={c} className="hover:bg-canvas">
                        <td className="td font-mono text-xs text-fg">{c}</td>
                        <td className="td font-mono text-[11px] text-subtle">{m.type}</td>
                        <td className="td">
                          <select value={m.sensitivity} onChange={e => update(t, c, { sensitivity: e.target.value })}
                            className={clsx('w-full cursor-pointer rounded px-2 py-1 text-xs font-medium outline-none', sensitivityClass(m.sensitivity))}>
                            {LEVELS.map(l => <option key={l} value={l} className="bg-surface text-fg">{l}</option>)}
                          </select>
                        </td>
                        <td className="td"><input value={m.description ?? ''} onChange={e => update(t, c, { description: e.target.value })}
                          className="w-full rounded border border-transparent bg-transparent px-2 py-1 text-xs text-fg-2 outline-none transition hover:border-line focus:border-accent focus:bg-surface" placeholder="Add a description…" /></td>
                      </tr>))}
                  </tbody>
                </table>
              </Card>)
          })}
        </div>)}
      <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
        <span className="font-mono text-xs text-subtle">Source: {dataset.source}</span>
        <Button variant="danger" onClick={() => act('delete')} loading={busy === 'delete'}><Trash2 className="h-4 w-4" /> Remove dataset</Button>
      </div>
    </section>
  )
}
