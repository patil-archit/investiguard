import clsx from 'clsx'
import {
  Ban, BrainCircuit, CheckCircle2, ChevronRight, Compass, Flag, KeyRound, Lightbulb, Lock, Play, ScanSearch,
  ShieldAlert, Sparkles, TriangleAlert, Wand2,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Hypothesis, IgEvent } from '../api'
import { Button, Card, Chip, Empty, ErrorNote, SectionTitle, StatusBadge } from '../components/ui'
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
    <div className="space-y-6">
      {/* problem */}
      <Card className="overflow-hidden">
        <div className="relative p-6">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-white">
                Find out <span className="gradient-text">why a number changed</span>
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-400">
                The agent proposes hypotheses, tests the least sensitive ones first, and is granted only the columns each
                test needs. Each grant is revoked once that test has a verdict.
              </p>
            </div>
            <span className={clsx('inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ring-1',
              mode === 'C' ? 'bg-emerald-500/10 text-emerald-200 ring-emerald-500/30' : 'bg-rose-500/10 text-rose-200 ring-rose-500/30')}>
              {mode === 'C' ? <ShieldAlert className="h-3.5 w-3.5" /> : <TriangleAlert className="h-3.5 w-3.5" />}
              {mode === 'C' ? 'Scoped access' : 'Unrestricted baseline'}
            </span>
          </div>

          {suggestions.length > 1 && (
            <div className="mt-5">
              <div className="label flex items-center gap-1.5"><Lightbulb className="h-3.5 w-3.5" /> Suggested from your data</div>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {suggestions.slice(0, 6).map(s => (
                  <button key={s} onClick={() => setProblem(s)}
                    className={clsx('card-hover rounded-xl border px-3.5 py-3 text-left text-[13px] leading-snug transition',
                      problem === s ? 'border-indigo-400/50 bg-indigo-500/10 text-slate-100' : 'border-white/[0.07] bg-white/[0.02] text-slate-400')}>
                    <span className="line-clamp-3">{s}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5">
            <div className="label">Business problem</div>
            <textarea className="input min-h-[84px] resize-y text-[15px] leading-relaxed" value={problem}
              onChange={e => setProblem(e.target.value)}
              placeholder="e.g. Revenue fell 18% in September compared with August. Find the root cause." />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button onClick={go} loading={starting || running} disabled={!problem.trim() || !dataset}>
                {!running && <Play className="h-4 w-4" />} {running ? 'Investigating…' : 'Run investigation'}
              </Button>
              <span className="text-xs text-slate-500">Lookup questions ("which…", "top 10…") belong in <b className="text-slate-400">Ask your data</b>.</span>
            </div>
            {startError && <div className="mt-3"><ErrorNote error={startError} /></div>}
          </div>
        </div>

        {run && (
          <div className="grid grid-cols-2 border-t border-white/[0.06] bg-white/[0.015] sm:grid-cols-5">
            <Counter icon={<BrainCircuit className="h-4 w-4" />} label="Hypotheses" value={hyps.length} />
            <Counter icon={<KeyRound className="h-4 w-4" />} label="Grants" value={counts.grants} />
            <Counter icon={<Ban className="h-4 w-4" />} label="Denials" value={counts.denials} tone={counts.denials ? 'bad' : undefined} />
            <Counter icon={<ScanSearch className="h-4 w-4" />} label="Queries" value={counts.queries} />
            <Counter icon={<CheckCircle2 className="h-4 w-4" />} label="Supported" value={counts.supported} tone={counts.supported ? 'good' : undefined} />
          </div>
        )}
      </Card>

      {!run ? (
        <Empty icon={<Sparkles className="h-5 w-5" />} title="No investigation yet"
          text="Pick a suggested problem or describe your own, then run. Hypotheses, grants, denials and revocations stream in live." />
      ) : (
        <>
          <div className="grid gap-6 xl:grid-cols-5">
            <Card className="p-5 xl:col-span-3">
              <SectionTitle icon={<BrainCircuit className="h-4 w-4" />} title="Hypotheses"
                sub="ranked by plausibility × information gain ÷ privilege cost" />
              <div className="space-y-2.5">
                {hyps.length === 0 && <Skeleton />}
                {[...hyps].sort((a, b) => b.priority - a.priority).map(h => (
                  <HypothesisCard key={h.id} h={h} active={h.id === current} />
                ))}
              </div>
            </Card>
            <Card className="flex flex-col p-5 xl:col-span-2">
              <SectionTitle icon={<Compass className="h-4 w-4" />} title="Live timeline" sub="every decision the control plane made"
                right={running ? <span className="flex items-center gap-1.5 text-xs text-sky-300"><span className="h-2 w-2 animate-pulse rounded-full bg-sky-400" />live</span> : null} />
              <Timeline events={run.events} />
            </Card>
          </div>
          {run.status === 'error' && <ErrorNote error={run.error ?? 'Investigation failed'} />}
          {run.investigation?.result && <ReportView inv={run.investigation} />}
        </>
      )}
    </div>
  )
}

function Counter({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number; tone?: 'good' | 'bad' }) {
  return (
    <div className="flex items-center gap-3 border-white/[0.06] px-5 py-3.5 [&:not(:last-child)]:border-r">
      <span className="text-slate-500">{icon}</span>
      <div>
        <div className={clsx('text-lg font-bold leading-none', tone === 'good' ? 'text-emerald-300' : tone === 'bad' ? 'text-rose-300' : 'text-white')}>{value}</div>
        <div className="mt-1 text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      </div>
    </div>
  )
}

function Skeleton() {
  return <div className="space-y-2.5">{[0, 1, 2].map(i => <div key={i} className="h-20 animate-pulse rounded-xl bg-white/[0.03]" />)}</div>
}

function HypothesisCard({ h, active }: { h: Hypothesis; active: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={clsx('rounded-xl border p-3.5 transition animate-fade-in',
      active ? 'border-sky-400/40 bg-sky-500/[0.06] shadow-[0_0_0_4px_rgb(56_189_248/0.06)]' : 'border-white/[0.06] bg-white/[0.02]')}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 font-mono text-[11px] font-semibold text-slate-500">{h.id}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={h.status} />
            {h.parent && <Chip tone="accent">drill-down of {h.parent}</Chip>}
            {h.kind === 'event' && <Chip>event lookup</Chip>}
            {h.status === 'SUPPORTED' && h.explained_share > 0 &&
              <Chip tone="accent">explains {(h.explained_share * 100).toFixed(0)}%</Chip>}
          </div>
          <p className="mt-1.5 text-[13.5px] leading-snug text-slate-200">{h.statement}</p>
          {h.finding && <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-400">{h.finding}</p>}
          <button onClick={() => setOpen(o => !o)} className="mt-2 flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-300">
            <ChevronRight className={clsx('h-3 w-3 transition', open && 'rotate-90')} /> {h.resources.length} declared columns
          </button>
          {open && <div className="mt-2 flex flex-wrap gap-1">{h.resources.map(r => <Chip key={r} mono>{r}</Chip>)}</div>}
        </div>
        <div className="w-24 shrink-0 text-right">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">priority</div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
            <div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-cyan-400" style={{ width: `${Math.min(100, h.priority * 250)}%` }} />
          </div>
          <div className="mt-1 font-mono text-[11px] text-slate-400">{h.priority.toFixed(3)}</div>
          <div className="mt-1 text-[10px] text-slate-500">cost {h.privilege_cost}</div>
        </div>
      </div>
    </div>
  )
}

const EVENT_STYLE: Record<string, { icon: ReactNode; ring: string }> = {
  plan: { icon: <Compass className="h-3.5 w-3.5" />, ring: 'text-indigo-300 bg-indigo-500/15' },
  cap_granted: { icon: <KeyRound className="h-3.5 w-3.5" />, ring: 'text-sky-300 bg-sky-500/15' },
  policy_denied: { icon: <Ban className="h-3.5 w-3.5" />, ring: 'text-rose-300 bg-rose-500/15' },
  query_ok: { icon: <CheckCircle2 className="h-3.5 w-3.5" />, ring: 'text-emerald-300 bg-emerald-500/15' },
  gateway_denied: { icon: <ShieldAlert className="h-3.5 w-3.5" />, ring: 'text-rose-300 bg-rose-500/15' },
  sql_error: { icon: <TriangleAlert className="h-3.5 w-3.5" />, ring: 'text-amber-300 bg-amber-500/15' },
  hypothesis_status: { icon: <Wand2 className="h-3.5 w-3.5" />, ring: 'text-violet-300 bg-violet-500/15' },
  cap_revoked: { icon: <Lock className="h-3.5 w-3.5" />, ring: 'text-slate-300 bg-slate-500/15' },
  stop: { icon: <Flag className="h-3.5 w-3.5" />, ring: 'text-cyan-300 bg-cyan-500/15' },
}

function describe(ev: IgEvent): { title: ReactNode; detail?: ReactNode } | null {
  const col = (r: string) => r.split('.').pop()
  switch (ev.kind) {
    case 'plan': return { title: <>Planner picks <b>{ev.hypothesis}</b></>, detail: `priority ${ev.priority}` }
    case 'cap_granted': return {
      title: <>Capability granted → <b>{ev.hypothesis}</b></>,
      detail: <span className="flex flex-wrap gap-1">{Object.entries(ev.resources as Record<string, string>).map(([r, m]) =>
        <Chip key={r} mono tone={m === 'aggregate_only' ? 'warn' : 'default'}>{col(r)}{m === 'aggregate_only' ? ' · count-only' : ''}</Chip>)}
        <span className="text-slate-500">TTL {ev.ttl_s}s</span></span>,
    }
    case 'policy_denied': return { title: <>Policy <b className="text-rose-300">DENY {ev.check}</b> · {ev.hypothesis}</>, detail: ev.reason }
    case 'query_ok': return { title: <>Query ran · {ev.rows} rows</>, detail: `${ev.columns.length} columns checked in ${Number(ev.latency_ms).toFixed(1)} ms` }
    case 'gateway_denied': return { title: <>Gateway <b className="text-rose-300">blocked</b> {ev.hypothesis}</>, detail: ev.reason }
    case 'sql_error': return { title: 'Query rejected, retrying', detail: ev.error }
    case 'hypothesis_status': return { title: <><b>{ev.hypothesis.id}</b> → <StatusBadge status={ev.hypothesis.status} /></> }
    case 'cap_revoked': return { title: <>Revoked capability for <b>{ev.hypothesis}</b></>, detail: String(ev.reason) }
    case 'stop': return { title: 'Investigation finished', detail: ev.reason }
    default: return null
  }
}

function Timeline({ events }: { events: IgEvent[] }) {
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [events.length])
  const items = events.map((ev, i) => ({ ev, i, d: describe(ev) })).filter(x => x.d)
  return (
    <div className="relative max-h-[640px] min-h-[200px] flex-1 overflow-y-auto pr-1">
      {items.length === 0 && <Skeleton />}
      <ol className="relative space-y-1 before:absolute before:bottom-2 before:left-[13px] before:top-2 before:w-px before:bg-white/[0.07]">
        {items.map(({ ev, i, d }) => {
          const s = EVENT_STYLE[ev.kind]
          return (
            <li key={i} className="relative flex gap-3 py-1.5 animate-fade-in">
              <span className={clsx('relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-lg ring-4 ring-ink-900', s.ring)}>{s.icon}</span>
              <div className="min-w-0 pt-0.5">
                <div className="text-[13px] text-slate-200">{d!.title}</div>
                {d!.detail && <div className="mt-0.5 text-[12px] leading-relaxed text-slate-500">{d!.detail}</div>}
              </div>
            </li>
          )
        })}
      </ol>
      <div ref={end} />
    </div>
  )
}
