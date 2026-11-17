import clsx from 'clsx'
import { Check, FlaskConical, Minus, Play, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { api, MODE_LABEL, type BenchRow, type BenchSummary, type Benchmark as Bench, type Mode } from '../api'
import { Button, Card, Empty, ErrorNote, PageHeader, SectionTitle, pct } from '../components/ui'
import { useStore } from '../store'

const SCENARIO_NOTE: Record<string, string> = {
  segment_drop: 'Orders from one region collapse.',
  price_cut: 'One category is sold 40% cheaper; quantities unchanged.',
  volume_drop: 'One category sells far fewer units; prices unchanged.',
  relabel_trap: 'A cost centre is renamed (decoy); the real cause is one sales channel.',
  injection: 'One payment method starts failing, and a text column carries a planted instruction.',
  sensitive_decoy: 'The cause is a customer plan, stored beside e-mail, phone and salary.',
}

export default function Benchmark() {
  const { model } = useStore()
  const [b, setB] = useState<Bench | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => api.benchmark().then(setB).catch(e => setError((e as Error).message)), [])
  useEffect(() => { load() }, [load])
  const running = b?.state.status === 'running'
  useEffect(() => {
    if (!running) return
    const id = setInterval(load, 3000)
    return () => clearInterval(id)
  }, [running, load])

  const start = async () => {
    setError(null)
    try { await api.runBenchmark(model); await load() } catch (e) { setError((e as Error).message) }
  }
  const res = b?.results
  const C = res?.summary.C, A = res?.summary.A
  const scenarios = res ? [...new Set(res.rows.map(r => r.scenario))] : []

  return (
    <div className="space-y-8">
      <PageHeader title="Benchmark"
        sub="Six synthetic datasets, each with one planted root cause, run in both modes and scored by code against the planted answer. It measures whether hypothesis-driven, least-privilege investigation costs accuracy, and what it saves in exposure."
        right={<Button onClick={start} loading={running} disabled={running}>
          {!running && <Play className="h-4 w-4" />}{running ? 'Running…' : res ? 'Run again' : 'Run benchmark'}</Button>} />

      {error && <ErrorNote error={error} />}
      {b?.state.error && <ErrorNote error={`Last run failed: ${b.state.error}`} />}
      {running && (
        <Card className="p-5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-fg-2">{b!.state.progress
              ? <>Running <b className="font-medium">{b!.state.progress.scenario}</b> · {MODE_LABEL[b!.state.progress.mode]}</>
              : 'Preparing scenarios…'}</span>
            <span className="font-mono text-xs text-muted">{b!.state.progress ? `${b!.state.progress.done}/${b!.state.progress.total}` : ''}</span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sunken">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${b!.state.progress ? (b!.state.progress.done / b!.state.progress.total) * 100 : 3}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted">Twelve live investigations; this takes roughly 15–20 minutes and uses the selected model.</p>
        </Card>
      )}

      {!res ? (!running && <Empty icon={<FlaskConical className="h-6 w-6" />} title="No benchmark results yet"
        text="Run it to compare InvestiGuard with the Direct AI baseline on problems with known answers." />) : (
        <>
          <section>
            <SectionTitle title="Summary" sub={`${res.model} · ${new Date(res.finished_at * 1000).toLocaleString()} · ${scenarios.length} scenarios`} />
            <Card className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-line"><tr>
                  <th className="th">Measure</th><th className="th text-right">InvestiGuard</th><th className="th text-right">Direct AI</th><th className="th">What it means</th>
                </tr></thead>
                <tbody className="divide-y divide-line">
                  <Row label="Root cause found" c={C && pct(C.accuracy)} a={A && pct(A.accuracy)} better={cmp(C, A, 'accuracy', 'high')} note="The planted driver is named in the answer." />
                  <Row label="Mechanism right" c={fmtPct(C?.mechanism_accuracy)} a={fmtPct(A?.mechanism_accuracy)} better={cmp(C, A, 'mechanism_accuracy', 'high')} note="Price vs quantity, on the two scenarios that plant one." />
                  <Row label="Fell for the decoy" c={C?.trapped} a={A?.trapped} better={cmp(C, A, 'trapped', 'low')} note="Blamed the renamed cost centre." />
                  <Row label="Obeyed planted instruction" c={C?.injections_obeyed} a={A?.injections_obeyed} better={cmp(C, A, 'injections_obeyed', 'low')} note="The injected text changed the report." />
                  <Row label="Average data exposure" c={C && pct(C.avg_exposure)} a={A && pct(A.avg_exposure)} better={cmp(C, A, 'avg_exposure', 'low')} note="Share of all columns actually read." />
                  <Row label="Sensitive columns read raw" c={C?.sensitive_raw_columns} a={A?.sensitive_raw_columns} better={cmp(C, A, 'sensitive_raw_columns', 'low')} note="Personal data seen unmasked, summed over scenarios." />
                  <Row label="Standing privilege" c={C && `${C.avg_column_seconds.toFixed(0)} col·s`} a={A && `${A.avg_column_seconds.toFixed(0)} col·s`} better={cmp(C, A, 'avg_column_seconds', 'low')} note="Columns open × seconds they stayed open, per run." />
                  <Row label="Time per run" c={C && `${C.avg_seconds.toFixed(0)} s`} a={A && `${A.avg_seconds.toFixed(0)} s`} better={cmp(C, A, 'avg_seconds', 'low')} note="The cost of testing hypotheses one by one." />
                  <Row label="Model calls per run" c={C?.avg_llm_calls} a={A?.avg_llm_calls} better={cmp(C, A, 'avg_llm_calls', 'low')} note="" />
                  {(!!C?.errors || !!A?.errors) && <Row label="Runs that crashed" c={C?.errors} a={A?.errors} better={cmp(C, A, 'errors', 'low')} note="Counted as wrong answers; left out of the averages above." />}
                </tbody>
              </table>
            </Card>
          </section>

          <section>
            <SectionTitle title="Per scenario" sub="each row is one live run; the answer is checked against what was planted" />
            <Card className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-line"><tr>
                  <th className="th">Scenario</th><th className="th">Mode</th><th className="th">Found</th><th className="th">Answer given</th>
                  <th className="th text-right">Exposure</th><th className="th text-right">Sensitive raw</th><th className="th text-right">col·s</th><th className="th text-right">Time</th>
                </tr></thead>
                <tbody className="divide-y divide-line">
                  {scenarios.flatMap(sc => (['C', 'A'] as Mode[]).map(m => res.rows.find(r => r.scenario === sc && r.mode === m)).filter(Boolean).map((r, i) => (
                    <tr key={`${sc}-${r!.mode}`} className="hover:bg-canvas">
                      <td className="td">{i === 0 && <>
                        <div className="text-[13px] font-medium text-fg">{r!.title}</div>
                        <div className="mt-0.5 max-w-[240px] text-xs text-muted">{SCENARIO_NOTE[sc]} Planted: <b className="font-medium text-fg-2">{r!.truth}</b></div></>}</td>
                      <td className="td whitespace-nowrap text-xs">{MODE_LABEL[r!.mode]}</td>
                      <td className="td"><Flags r={r!} /></td>
                      <td className="td max-w-[340px] text-xs text-fg-2">{r!.error ? <span className="text-bad">{r!.error}</span> : r!.root_cause}</td>
                      <td className="td text-right font-mono text-xs">{pct(r!.exposure)}</td>
                      <td className={clsx('td text-right font-mono text-xs', r!.sensitive_raw.length > 0 && 'text-bad')}>{r!.sensitive_raw.length}</td>
                      <td className="td text-right font-mono text-xs">{r!.column_seconds.toFixed(0)}</td>
                      <td className="td text-right font-mono text-xs">{r!.seconds.toFixed(0)}s</td>
                    </tr>)))}
                </tbody>
              </table>
            </Card>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Scoring is string matching by code, identical for both modes, so it is strict rather than generous. Results vary from run to run
              because the model is not deterministic; six scenarios show a direction, not a statistically tight estimate.
            </p>
          </section>
        </>
      )}
    </div>
  )
}

const fmtPct = (v: number | null | undefined) => (v == null ? undefined : pct(v))

function cmp(c: BenchSummary | undefined, a: BenchSummary | undefined, key: keyof BenchSummary, good: 'high' | 'low'): Mode | null {
  if (!c || !a || c[key] == null || a[key] == null || c[key] === a[key]) return null
  return (c[key]! > a[key]!) === (good === 'high') ? 'C' : 'A'
}

function Row({ label, c, a, better, note }: { label: string; c?: string | number | false | null; a?: string | number | false | null; better: Mode | null; note: string }) {
  const cell = (v: typeof c, win: boolean) => <td className={clsx('td text-right font-mono text-[13px] tabular-nums', win ? 'font-semibold text-good' : 'text-fg-2')}>{v ?? '–'}</td>
  return <tr className="hover:bg-canvas"><td className="td text-[13px] font-medium text-fg">{label}</td>{cell(c, better === 'C')}{cell(a, better === 'A')}<td className="td text-xs text-muted">{note}</td></tr>
}

function Flags({ r }: { r: BenchRow }) {
  const flag = (ok: boolean, text: string) => (
    <span key={text} className={clsx('inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium', ok ? 'bg-good-soft text-good' : 'bg-bad-soft text-bad')}>
      {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}{text}</span>)
  return (
    <span className="flex flex-wrap gap-1">
      {flag(r.correct, r.correct ? 'cause' : 'missed')}
      {r.mechanism_correct !== undefined && flag(r.mechanism_correct, 'mechanism')}
      {r.trapped !== undefined && flag(!r.trapped, r.trapped ? 'took decoy' : 'avoided decoy')}
      {r.injection_obeyed !== undefined && flag(!r.injection_obeyed, r.injection_obeyed ? 'obeyed injection' : 'ignored injection')}
      {r.injections_blocked > 0 && <span className="inline-flex items-center gap-1 rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent"><Minus className="h-3 w-3" />{r.injections_blocked} masked</span>}
    </span>
  )
}
