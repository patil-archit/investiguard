import clsx from 'clsx'
import { Bot, GitCompareArrows, RefreshCw, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { api, type CompareRow } from '../api'
import { Button, Card, Chip, Empty, PageHeader, SectionTitle, pct } from '../components/ui'
import { useStore } from '../store'

export default function Compare() {
  const { dataset, runs } = useStore()
  const [rows, setRows] = useState<CompareRow[]>([])
  const load = useCallback(() => { if (dataset) api.compare(dataset.name).then(setRows).catch(() => setRows([])) }, [dataset])
  useEffect(load, [load, runs])
  const C = rows.find(r => r.mode === 'C'), A = rows.find(r => r.mode === 'A')

  return (
    <div className="space-y-8">
      <PageHeader title="InvestiGuard vs Direct AI"
        sub="Run the same problem in both modes (switch in the sidebar). Hypothesis-driven InvestiGuard should reach the same or a better answer while reading far less data, with every verdict checked by code." />
      {rows.length === 0 ? (
        <Empty icon={<GitCompareArrows className="h-6 w-6" />} title="Nothing to compare yet"
          text="Run an investigation in InvestiGuard mode, switch to Direct AI in the sidebar, and run the same problem again." />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {[C, A].map((r, i) => r ? <Side key={r.mode} r={r} /> : (
              <div key={i} className="grid place-items-center rounded-lg border border-dashed border-line-strong p-10 text-sm text-muted">
                Run the {i === 0 ? 'InvestiGuard' : 'Direct AI'} mode to fill this side.
              </div>))}
          </div>
          {C && A && (
            <section>
              <SectionTitle icon={<GitCompareArrows className="h-4 w-4" />} title="Exposure side by side"
                right={<Button variant="ghost" onClick={load} aria-label="Refresh"><RefreshCw className="h-4 w-4" /></Button>} />
              <Card className="p-6">
                <div className="mb-5 flex gap-5 text-xs text-muted">
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-accent" />InvestiGuard</span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-line-strong" />Direct AI</span>
                </div>
                <div className="space-y-5">
                  <Bars label="Columns touched" a={A.exposure.columns_touched.length} c={C.exposure.columns_touched.length} max={C.exposure.columns_total} />
                  <Bars label="Sensitive columns exposed raw" a={A.exposure.sensitive_exposed_raw.length} c={C.exposure.sensitive_exposed_raw.length} max={Math.max(1, A.exposure.sensitive_exposed_raw.length, C.exposure.sensitive_exposed_raw.length)} />
                  <Bars label="Queries denied" a={A.exposure.queries_denied} c={C.exposure.queries_denied} max={Math.max(1, A.exposure.queries_denied, C.exposure.queries_denied)} />
                  <Bars label="Seconds" a={A.seconds} c={C.seconds} max={Math.max(A.seconds, C.seconds)} />
                </div>
                {A.exposure.columns_touched.length > 0 && (
                  <p className="mt-6 border-t border-line pt-4 text-sm text-fg-2">
                    {C.exposure.columns_touched.length < A.exposure.columns_touched.length
                      ? <>InvestiGuard touched <b className="font-semibold text-good">{pct(1 - C.exposure.columns_touched.length / A.exposure.columns_touched.length)}</b> fewer columns than Direct AI on this problem. </>
                      : <>Direct AI read <b className="font-semibold text-bad">{A.exposure.sensitive_exposed_raw.length}</b> sensitive column(s) raw; InvestiGuard read <b className="font-semibold text-good">{C.exposure.sensitive_exposed_raw.length}</b>. </>}
                    InvestiGuard's verdicts were computed by code; Direct AI judged its own findings.
                  </p>)}
              </Card>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function Side({ r }: { r: CompareRow }) {
  const scoped = r.mode === 'C'
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        {scoped ? <ShieldCheck className="h-4 w-4 text-good" /> : <Bot className="h-4 w-4 text-warn" />}
        <span className="text-sm font-semibold text-fg">{scoped ? 'InvestiGuard · hypothesis-driven' : 'Direct AI · no checks'}</span>
        <span className="ml-auto font-mono text-xs text-subtle">{r.seconds}s</span>
      </div>
      <p className="mt-3 text-[14px] leading-relaxed text-fg-2">{r.root_cause}</p>
      <div className="mt-4 grid grid-cols-4 gap-px overflow-hidden rounded-md border border-line bg-line">
        <Mini label="Columns" value={`${r.exposure.columns_touched.length}/${r.exposure.columns_total}`} />
        <Mini label="Exposure" value={pct(r.exposure.data_exposure_ratio)} />
        <Mini label="Sensitive raw" value={String(r.exposure.sensitive_exposed_raw.length)} bad={r.exposure.sensitive_exposed_raw.length > 0} />
        <Mini label="Checked by code" value={r.verified ? 'Yes' : 'No'} bad={!r.verified} />
      </div>
      <div className="mt-4 flex flex-wrap gap-1">{r.exposure.columns_touched.map(c => <Chip key={c} mono>{c.split('.').pop()}</Chip>)}</div>
    </Card>
  )
}

function Mini({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return <div className="bg-surface px-3 py-2.5">
    <div className="eyebrow">{label}</div>
    <div className={clsx('mt-0.5 text-lg font-semibold tabular-nums', bad ? 'text-bad' : 'text-fg')}>{value}</div>
  </div>
}

function Bars({ label, a, c, max }: { label: string; a: number; c: number; max: number }) {
  const w = (v: number) => `${max ? Math.max(1.5, (v / max) * 100) : 0}%`
  return (
    <div>
      <div className="mb-2 text-xs font-medium text-fg-2">{label}</div>
      <div className="space-y-1.5">
        {([['InvestiGuard', c, 'bg-accent'], ['Direct AI', a, 'bg-line-strong']] as const).map(([n, v, cls]) => (
          <div key={n} className="flex items-center gap-3">
            <span className="w-24 text-[11.5px] text-muted">{n}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-sm bg-sunken">
              <div className={clsx('h-full rounded-sm transition-all', cls)} style={{ width: w(v) }} />
            </div>
            <span className="w-10 text-right font-mono text-xs tabular-nums text-fg-2">{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
