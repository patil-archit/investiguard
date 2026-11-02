import clsx from 'clsx'
import {
  ArrowRight, Ban, Bot, CheckCircle2, ChevronRight, Compass, Flag, KeyRound, ListChecks, Lock, ScanSearch, ShieldAlert,
  TriangleAlert,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { DirectStep, Hypothesis, IgEvent } from '../api'
import { Button, Card, Chip, Empty, ErrorNote, PageHeader, SectionTitle, StatusBadge } from '../components/ui'
import { useStore } from '../store'
import ReportView from './ReportView'

function deriveHypotheses(events: IgEvent[]) {
  const hyps: Record<string, Hypothesis> = {}
  let current: string | null = null
  for (const ev of events) {
    if (ev.kind === 'hypothesis_proposed' || ev.kind === 'hypothesis_status') hyps[ev.hypothesis.id] = { ...ev.hypothesis }
    if (ev.kind === 'plan') current = ev.hypothesis
    if (ev.kind === 'cap_granted' && hyps[ev.hypothesis]) hyps[ev.hypothesis].status = 'TESTING'
    if (ev.kind === 'policy_denied' && hyps[ev.hypothesis]) hyps[ev.hypothesis].status = 'BLOCKED'
    if (ev.kind === 'stop') current = null
  }
  return { hyps: Object.values(hyps), current }
}

/** Direct AI runs have no hypotheses: rebuild its query steps from the event stream. */
function deriveSteps(events: IgEvent[]): DirectStep[] {
  const steps: DirectStep[] = []
  for (const ev of events) {
    if (ev.kind === 'direct_step' && ev.sql) steps.push({ id: ev.step, thought: ev.thought, sql: ev.sql, error: null, rows: 0, columns: [] })
    const s = steps.find(x => x.id === ev.hypothesis)
    if (!s) continue
    if (ev.kind === 'query_ok') Object.assign(s, { rows: ev.rows, columns: ev.columns })
    if (ev.kind === 'sql_error') s.error = ev.error
    if (ev.kind === 'gateway_denied') s.error = ev.reason
  }
  return steps
}

export default function Investigate() {
  const { dataset, mode, runs, startRun } = useStore()
  const key = `${dataset?.name}:${mode}`
  const run = runs[key]
  const suggestions = dataset?.suggested_problems?.length ? dataset.suggested_problems : [dataset?.problem ?? '']
  const [problem, setProblem] = useState(suggestions[0] ?? '')
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  useEffect(() => { setProblem(run?.problem ?? suggestions[0] ?? '') }, [dataset?.name]) // eslint-disable-line react-hooks/exhaustive-deps

  const { hyps, current } = useMemo(() => deriveHypotheses(run?.events ?? []), [run?.events])
  const steps = useMemo(() => deriveSteps(run?.events ?? []), [run?.events])
  const direct = mode === 'A'
  const counts = useMemo(() => {
    const ev = run?.events ?? []
    const c = (k: string) => ev.filter(e => e.kind === k).length
    return { grants: c('cap_granted'), denials: c('policy_denied') + c('gateway_denied'), queries: c('query_ok'),
      supported: hyps.filter(h => h.status === 'SUPPORTED').length }
  }, [run?.events, hyps])

  const go = async () => {
    setStarting(true); setStartError(null)
    try { await startRun(problem) } catch (e) { setStartError((e as Error).message) } finally { setStarting(false) }
  }
  const running = run?.status === 'running'

  return (
    <div className="space-y-8">
      <PageHeader title="Investigate a change"
        sub={direct
          ? 'Direct AI baseline: the AI sees every column, runs whatever queries it likes and states the reason itself. Nothing it concludes is checked by code.'
          : 'The agent proposes hypotheses, tests the least sensitive ones first, and is granted only the columns each test needs. Every grant is revoked once its test has a verdict.'}
        right={<span className={clsx('inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium',
          direct ? 'border-warn/25 bg-warn-soft text-warn' : 'border-good/25 bg-good-soft text-good')}>
          {direct ? <Bot className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
          {direct ? 'Direct AI · no checks' : 'InvestiGuard · hypothesis-driven'}
        </span>} />

      <Card>
        <div className="p-5">
          {suggestions.length > 1 && (
            <div className="mb-5">
              <div className="label">Suggested from your data</div>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {suggestions.slice(0, 6).map(s => (
                  <button key={s} onClick={() => setProblem(s)}
                    className={clsx('rounded-md border px-3.5 py-3 text-left text-[13px] leading-snug transition',
                      problem === s ? 'border-accent bg-accent-soft/60 text-fg shadow-[0_0_0_1px_var(--color-accent)]'
                        : 'border-line bg-surface text-muted hover:border-line-strong hover:text-fg')}>
                    <span className="line-clamp-3">{s}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="label">Business problem</div>
          <textarea className="input min-h-[88px] resize-y text-[14.5px] leading-relaxed" value={problem}
            onChange={e => setProblem(e.target.value)}
            placeholder="e.g. Revenue fell 18% in September compared with August. Find the root cause." />
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <Button onClick={go} loading={starting || running} disabled={!problem.trim() || !dataset}>
              {running ? 'Investigating…' : <>Run investigation <ArrowRight className="h-4 w-4" /></>}
            </Button>
            <span className="text-xs text-muted">Lookup questions (“which…”, “top 10…”) belong in <b className="font-medium text-fg-2">Ask your data</b>.</span>
          </div>
          {startError && <div className="mt-3"><ErrorNote error={startError} /></div>}
        </div>

        {run && (
          <div className="grid grid-cols-2 border-t border-line sm:grid-cols-5">
            {direct ? <>
              <Counter label="Queries run" value={counts.queries} />
              <Counter label="Errors" value={steps.filter(s => s.error).length} tone={steps.some(s => s.error) ? 'bad' : undefined} />
              <Counter label="Columns open" value={dataset?.columns ?? 0} />
              <Counter label="Policy checks" value={0} />
              <Counter label="Verdicts by code" value={0} />
            </> : <>
              <Counter label="Hypotheses" value={hyps.length} />
              <Counter label="Grants" value={counts.grants} />
              <Counter label="Denials" value={counts.denials} tone={counts.denials ? 'bad' : undefined} />
              <Counter label="Queries" value={counts.queries} />
              <Counter label="Supported" value={counts.supported} tone={counts.supported ? 'good' : undefined} />
            </>}
          </div>
        )}
      </Card>

      {!run ? (
        <Empty icon={<ScanSearch className="h-6 w-6" />} title="No investigation yet"
          text="Pick a suggested problem or describe your own, then run. Hypotheses, grants, denials and revocations stream in live." />
      ) : (
        <>
          <div className="grid gap-6 xl:grid-cols-5">
            {direct ? (
              <div className="xl:col-span-3">
                <SectionTitle icon={<Bot className="h-4 w-4" />} title="What the AI looked at"
                  sub="free-form queries chosen by the AI; no hypotheses, no per-query permission" />
                <div className="space-y-2">
                  {steps.length === 0 && <Skeleton />}
                  {steps.map(s => <StepCard key={s.id} s={s} />)}
                </div>
              </div>
            ) : (
              <div className="xl:col-span-3">
                <SectionTitle icon={<ListChecks className="h-4 w-4" />} title="Hypotheses"
                  sub="ranked by plausibility × information gain ÷ privilege cost" />
                <div className="space-y-2">
                  {hyps.length === 0 && <Skeleton />}
                  {[...hyps].sort((a, b) => b.priority - a.priority).map(h => (
                    <HypothesisCard key={h.id} h={h} active={h.id === current} />
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-col xl:col-span-2">
              <SectionTitle icon={<Compass className="h-4 w-4" />} title="Timeline" sub="every decision the control plane made"
                right={running ? <span className="flex items-center gap-1.5 text-xs font-medium text-accent"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />Live</span> : null} />
              <Card className="flex-1 p-4"><Timeline events={run.events} /></Card>
            </div>
          </div>
          {run.status === 'error' && <ErrorNote error={run.error ?? 'Investigation failed'} />}
          {run.investigation?.result && <ReportView inv={run.investigation} />}
        </>
      )}
    </div>
  )
}

function Counter({ label, value, tone }: { label: string; value: number; tone?: 'good' | 'bad' }) {
  return (
    <div className="border-line px-5 py-3.5 [&:not(:last-child)]:border-r">
      <div className="eyebrow">{label}</div>
      <div className={clsx('mt-1 text-xl font-semibold tabular-nums', tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : 'text-fg')}>{value}</div>
    </div>
  )
}

function Skeleton() {
  return <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-20 animate-pulse rounded-lg bg-sunken" />)}</div>
}

function StepCard({ s }: { s: DirectStep }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="card p-4 animate-fade-in">
      <div className="flex items-start gap-4">
        <span className="mt-0.5 font-mono text-[11px] text-subtle">{s.id}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] leading-snug text-fg">{s.thought}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
            {s.error ? <span className="text-bad">{s.error}</span> : <>
              <span>{s.rows} rows ·</span>
              {s.columns.map(c => <Chip key={c} mono>{c.split('.').pop()}</Chip>)}
            </>}
          </div>
          <button onClick={() => setOpen(o => !o)} className="mt-2 flex items-center gap-1 text-[11.5px] text-subtle hover:text-fg">
            <ChevronRight className={clsx('h-3 w-3 transition', open && 'rotate-90')} /> SQL
          </button>
          {open && <pre className="mt-2 overflow-x-auto rounded-md border border-line bg-sunken p-3 font-mono text-[11.5px] text-fg-2">{s.sql}</pre>}
        </div>
      </div>
    </div>
  )
}

function HypothesisCard({ h, active }: { h: Hypothesis; active: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={clsx('card p-4 transition animate-fade-in', active && 'border-accent shadow-[0_0_0_1px_var(--color-accent)]')}>
      <div className="flex items-start gap-4">
        <span className="mt-0.5 font-mono text-[11px] text-subtle">{h.id}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={h.status} />
            {h.parent && <Chip>drill-down of {h.parent}</Chip>}
            {h.kind === 'event' && <Chip>event lookup</Chip>}
            {h.status === 'SUPPORTED' && h.explained_share > 0 &&
              <Chip tone="accent">explains {(h.explained_share * 100).toFixed(0)}%</Chip>}
          </div>
          <p className="mt-2 text-[13.5px] leading-snug text-fg">{h.statement}</p>
          {h.finding && <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{h.finding}</p>}
          <button onClick={() => setOpen(o => !o)} className="mt-2 flex items-center gap-1 text-[11.5px] text-subtle hover:text-fg">
            <ChevronRight className={clsx('h-3 w-3 transition', open && 'rotate-90')} /> {h.resources.length} declared columns
          </button>
          {open && <div className="mt-2 flex flex-wrap gap-1">{h.resources.map(r => <Chip key={r} mono>{r}</Chip>)}</div>}
        </div>
        <div className="w-24 shrink-0 text-right">
          <div className="eyebrow">Priority</div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-sunken">
            <div className="h-full rounded-full bg-fg" style={{ width: `${Math.min(100, h.priority * 250)}%` }} />
          </div>
          <div className="mt-1 font-mono text-[11px] text-fg-2">{h.priority.toFixed(3)}</div>
          <div className="text-[10.5px] text-subtle">cost {h.privilege_cost}</div>
        </div>
      </div>
    </div>
  )
}

const EVENT_STYLE: Record<string, { icon: ReactNode; tone: string }> = {
  plan: { icon: <Compass className="h-3.5 w-3.5" />, tone: 'text-fg-2' },
  direct_step: { icon: <Bot className="h-3.5 w-3.5" />, tone: 'text-warn' },
  cap_granted: { icon: <KeyRound className="h-3.5 w-3.5" />, tone: 'text-accent' },
  policy_denied: { icon: <Ban className="h-3.5 w-3.5" />, tone: 'text-bad' },
  query_ok: { icon: <CheckCircle2 className="h-3.5 w-3.5" />, tone: 'text-good' },
  gateway_denied: { icon: <ShieldAlert className="h-3.5 w-3.5" />, tone: 'text-bad' },
  sql_error: { icon: <TriangleAlert className="h-3.5 w-3.5" />, tone: 'text-warn' },
  hypothesis_status: { icon: <ListChecks className="h-3.5 w-3.5" />, tone: 'text-fg-2' },
  cap_revoked: { icon: <Lock className="h-3.5 w-3.5" />, tone: 'text-subtle' },
  stop: { icon: <Flag className="h-3.5 w-3.5" />, tone: 'text-fg' },
}

function describe(ev: IgEvent): { title: ReactNode; detail?: ReactNode } | null {
  const col = (r: string) => r.split('.').pop()
  switch (ev.kind) {
    case 'plan': return { title: <>Planner picks <b className="font-medium">{ev.hypothesis}</b></>, detail: `priority ${ev.priority}` }
    case 'direct_step': return ev.done
      ? { title: <>AI decides it has the answer</>, detail: ev.thought }
      : { title: <>AI runs <b className="font-medium">{ev.step}</b></>, detail: ev.thought }
    case 'cap_granted': if (ev.resources?.['*']) return { title: <>Whole database opened to the AI</>, detail: `all columns, raw, TTL ${ev.ttl_s}s` }
      return {
      title: <>Capability granted to <b className="font-medium">{ev.hypothesis}</b></>,
      detail: <span className="mt-1 flex flex-wrap items-center gap-1">{Object.entries(ev.resources as Record<string, string>).map(([r, m]) =>
        <Chip key={r} mono tone={m === 'aggregate_only' ? 'warn' : 'default'}>{col(r)}{m === 'aggregate_only' ? ' · count-only' : ''}</Chip>)}
        <span className="text-subtle">TTL {ev.ttl_s}s</span></span>,
    }
    case 'policy_denied': return { title: <>Policy <b className="font-medium text-bad">denied {ev.check}</b> · {ev.hypothesis}</>, detail: ev.reason }
    case 'query_ok': return { title: <>Query ran · {ev.rows} rows</>, detail: `${ev.columns.length} columns checked in ${Number(ev.latency_ms).toFixed(1)} ms` }
    case 'gateway_denied': return { title: <>Gateway <b className="font-medium text-bad">blocked</b> {ev.hypothesis}</>, detail: ev.reason }
    case 'sql_error': return { title: 'Query rejected, retrying', detail: ev.error }
    case 'hypothesis_status': return { title: <span className="flex items-center gap-2"><b className="font-medium">{ev.hypothesis.id}</b><StatusBadge status={ev.hypothesis.status} /></span> }
    case 'cap_revoked': return { title: <>Revoked capability for <b className="font-medium">{ev.hypothesis}</b></>, detail: String(ev.reason) }
    case 'stop': return { title: <b className="font-medium">Investigation finished</b>, detail: ev.reason }
    default: return null
  }
}

function Timeline({ events }: { events: IgEvent[] }) {
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [events.length])
  const items = events.map((ev, i) => ({ ev, i, d: describe(ev) })).filter(x => x.d)
  return (
    <div className="relative max-h-[640px] min-h-[200px] overflow-y-auto pr-1">
      {items.length === 0 && <Skeleton />}
      <ol className="relative before:absolute before:bottom-3 before:left-[11px] before:top-3 before:w-px before:bg-line">
        {items.map(({ ev, i, d }) => {
          const s = EVENT_STYLE[ev.kind]
          return (
            <li key={i} className="relative flex gap-3 py-2 animate-fade-in">
              <span className={clsx('relative z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line bg-surface', s.tone)}>{s.icon}</span>
              <div className="min-w-0 pt-0.5">
                <div className="text-[13px] text-fg">{d!.title}</div>
                {d!.detail && <div className="mt-0.5 text-[12px] leading-relaxed text-muted">{d!.detail}</div>}
              </div>
            </li>
          )
        })}
      </ol>
      <div ref={end} />
    </div>
  )
}
