import clsx from 'clsx'
import { GitCompareArrows, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { api, type CompareRow } from '../api'
import { Button, Card, Chip, Empty, SectionTitle, pct } from '../components/ui'
import { useStore } from '../store'

export default function Compare() {
  const { dataset, runs } = useStore()
  const [rows, setRows] = useState<CompareRow[]>([])
  const load = useCallback(() => { if (dataset) api.compare(dataset.name).then(setRows).catch(() => setRows([])) }, [dataset])
  useEffect(load, [load, runs])
  const C = rows.find(r => r.mode === 'C'), A = rows.find(r => r.mode === 'A')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-white">Scoped <span className="gradient-text">vs</span> unrestricted</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          Run the same problem in both access modes (switch in the sidebar). A good result means the same root cause with far less data touched.
        </p>
      </div>
      {rows.length === 0 ? (
        <Empty icon={<GitCompareArrows className="h-5 w-5" />} title="Nothing to compare yet"
          text="Run an investigation in Scoped mode, switch to Unrestricted in the sidebar, and run the same problem again." />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {[C, A].map((r, i) => r ? <Side key={r.mode} r={r} /> : (
              <Card key={i} className="grid place-items-center p-10 text-sm text-slate-500">
                Run the {i === 0 ? 'Scoped' : 'Unrestricted'} mode to fill this side.
              </Card>))}
          </div>
          {C && A && (
            <Card className="p-6">
              <SectionTitle icon={<GitCompareArrows className="h-4 w-4" />} title="Exposure side by side" right={<Button variant="ghost" onClick={load}><RefreshCw className="h-4 w-4" /></Button>} />
              <div className="space-y-5">
                <Bars label="Columns touched" a={A.exposure.columns_touched.length} c={C.exposure.columns_touched.length} max={C.exposure.columns_total} />
                <Bars label="Sensitive columns exposed raw" a={A.exposure.sensitive_exposed_raw.length} c={C.exposure.sensitive_exposed_raw.length} max={Math.max(1, A.exposure.sensitive_exposed_raw.length, C.exposure.sensitive_exposed_raw.length)} />
                <Bars label="Queries denied" a={A.exposure.queries_denied} c={C.exposure.queries_denied} max={Math.max(1, A.exposure.queries_denied, C.exposure.queries_denied)} />
                <Bars label="Seconds" a={A.seconds} c={C.seconds} max={Math.max(A.seconds, C.seconds)} />
              </div>
              {A.exposure.columns_touched.length > 0 && (
                <p className="mt-5 text-sm text-slate-300">
                  Scoped mode touched <b className="text-emerald-300">{pct(1 - C.exposure.columns_touched.length / A.exposure.columns_touched.length)}</b> fewer
                  columns than the unrestricted baseline on this problem.
                </p>)}
            </Card>
          )}
        </>
      )}
    </div>
  )
}

function Side({ r }: { r: CompareRow }) {
  const scoped = r.mode === 'C'
  return (
    <Card className={clsx('p-5', scoped ? 'ring-1 ring-emerald-400/20' : 'ring-1 ring-rose-400/20')}>
      <div className="flex items-center gap-2">
        {scoped ? <ShieldCheck className="h-5 w-5 text-emerald-300" /> : <TriangleAlert className="h-5 w-5 text-rose-300" />}
        <span className="font-semibold text-white">{scoped ? 'InvestiGuard · scoped' : 'Unrestricted baseline'}</span>
        <span className="ml-auto text-xs text-slate-500">{r.seconds}s</span>
      </div>
      <p className="mt-3 text-[14px] leading-relaxed text-slate-200">{r.root_cause}</p>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Mini label="columns" value={`${r.exposure.columns_touched.length}/${r.exposure.columns_total}`} />
        <Mini label="exposure" value={pct(r.exposure.data_exposure_ratio)} />
        <Mini label="sensitive raw" value={String(r.exposure.sensitive_exposed_raw.length)} bad={r.exposure.sensitive_exposed_raw.length > 0} />
      </div>
      <div className="mt-4 flex flex-wrap gap-1">{r.exposure.columns_touched.map(c => <Chip key={c} mono>{c.split('.').pop()}</Chip>)}</div>
    </Card>
  )
}

function Mini({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return <div className="rounded-xl bg-white/[0.03] px-2 py-2.5 ring-1 ring-white/5">
    <div className={clsx('text-lg font-bold', bad ? 'text-rose-300' : 'text-white')}>{value}</div>
    <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
  </div>
}

function Bars({ label, a, c, max }: { label: string; a: number; c: number; max: number }) {
  const w = (v: number) => `${max ? Math.max(2, (v / max) * 100) : 0}%`
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-slate-400">{label}</div>
      <div className="space-y-1.5">
        {[['Scoped', c, 'from-emerald-400 to-teal-300'], ['Unrestricted', a, 'from-rose-400 to-orange-300']].map(([n, v, g]) => (
          <div key={n as string} className="flex items-center gap-3">
            <span className="w-24 text-[11px] text-slate-500">{n}</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/5">
              <div className={clsx('h-full rounded-full bg-gradient-to-r transition-all', g as string)} style={{ width: w(v as number) }} />
            </div>
            <span className="w-10 text-right font-mono text-xs text-slate-300">{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
