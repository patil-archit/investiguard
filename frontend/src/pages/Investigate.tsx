import clsx from 'clsx'
import { ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api, MODE_LABEL, MODE_PLAIN, type DirectStep, type Hypothesis, type IgEvent, type Mode } from '../api'
import { Arrow, C, Mascot, Sticker } from '../components/brand'
import { Term } from '../components/gloss'
import { ApprovalBanner } from '../components/Insight'
import { CapabilityGantt, CHECK_PLAIN, CountUp, deriveHypotheses, Narrator, ProvenanceGraph, SecurityFeed } from '../components/studio'
import { Chip, Empty, ErrorNote, StatusBadge } from '../components/ui'
import { useStore } from '../store'
import ReportView from './ReportView'

/** Direct runs (systems A and B) have no hypotheses: rebuild their query steps from the event stream. */
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

const MODE_BG: Record<Mode, string> = { C: C.mustard, B: C.tangerine, A: C.paper }

export default function Investigate() {
  const { dataset, mode, setMode, runs, startRun, allowTables, setAllowTables, draftProblem, setDraftProblem } = useStore()
  const key = `${dataset?.name}:${mode}`
  const run = runs[key]
  const suggestions = dataset?.suggested_problems?.length ? dataset.suggested_problems : [dataset?.problem ?? '']
  const [problem, setProblem] = useState(suggestions[0] ?? '')
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [tables, setTables] = useState<string[]>([])
  useEffect(() => {
    if (draftProblem) { setProblem(draftProblem); setDraftProblem(null); return }
    setProblem(run?.problem ?? suggestions[0] ?? '')
  }, [dataset?.name]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!dataset) return
    api.catalog(dataset.name).then(c => {
      const t = Object.keys(c.tables)
      setTables(t)
      if (!allowTables.some(x => t.includes(x))) setAllowTables(t.slice(0, 2))
    }).catch(() => setTables([]))
  }, [dataset?.name]) // eslint-disable-line react-hooks/exhaustive-deps

  const events = useMemo(() => run?.events ?? [], [run?.events])
  const { hyps, current } = useMemo(() => deriveHypotheses(events), [events])
  const steps = useMemo(() => deriveSteps(events), [events])
  const direct = mode !== 'C'
  const counts = useMemo(() => {
    const c = (k: string) => events.filter(e => e.kind === k).length
    const opened = new Set<string>()
    events.filter(e => e.kind === 'cap_granted').forEach(e => Object.keys(e.resources ?? {}).forEach(r => opened.add(r)))
    return { grants: c('cap_granted'), denials: c('policy_denied') + c('gateway_denied'), queries: c('query_ok'),
      supported: hyps.filter(h => h.status === 'SUPPORTED').length, injections: c('injection_blocked'),
      columns: opened.has('*') ? dataset?.columns ?? 0 : opened.size }
  }, [events, hyps, dataset?.columns])

  const go = async () => {
    setStarting(true); setStartError(null)
    try { await startRun(problem) } catch (e) { setStartError((e as Error).message) } finally { setStarting(false) }
  }
  const running = run?.status === 'running'
  const [answered, setAnswered] = useState<string[]>([])
  const pending = useMemo(() => {
    const asks = events.filter(e => e.kind === 'approval_requested')
    const last = asks[asks.length - 1]
    if (!last || !running || events.some(e => e.kind === 'approval_decided' && e.hypothesis === last.hypothesis)) return null
    return answered.includes(`${run!.id}:${last.hypothesis}`) ? null : last
  }, [events, run, running, answered])

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------ hero / launch pad */}
      <section className="relative overflow-hidden rounded-[26px] bg-oxblood px-5 pb-7 pt-8 text-paper sm:px-9">
        <div className="display pointer-events-none absolute -right-6 -top-10 select-none text-[220px] leading-none text-scarlet/35">?</div>
        <Mascot size={150} mood={running ? 'wow' : run?.status === 'done' ? 'cool' : 'happy'} head={C.blush}
          className="absolute -right-4 bottom-6 hidden rotate-[-10deg] animate-bob lg:block" />
        <Sticker r={-4} className="bg-mustard text-ink">Agent studio</Sticker>
        <h1 className="display relative mt-5 max-w-4xl animate-[rise_.7s_cubic-bezier(.2,.8,.2,1)_both] text-[clamp(40px,6vw,86px)]">Why did the number move?</h1>
        <p className="relative mt-4 max-w-2xl text-[15px] leading-relaxed text-paper/85">
          Type the change you want explained. Watch the agent make <Term t="hypothesis">guesses</Term>, get a short-lived
          {' '}<Term t="capability">permission key</Term> for each, and let <Term t="evidence engine">code</Term> decide what is true.
        </p>

        {suggestions.length > 1 && (
          <div className="relative mt-6 flex max-w-5xl flex-wrap gap-2">
            {suggestions.slice(0, 5).map((s, i) => (
              <button key={s} onClick={() => setProblem(s)} title={s}
                className={clsx('max-w-[340px] truncate rounded-full border-2 px-3.5 py-1.5 text-left font-label text-[10.5px] font-bold uppercase tracking-[0.04em] transition',
                  problem === s ? 'border-mustard bg-mustard text-ink' : 'border-paper/30 text-paper/80 hover:border-paper hover:text-paper')}>
                {String(i + 1).padStart(2, '0')} · {s}
              </button>
            ))}
          </div>
        )}

        <div className="relative mt-5 max-w-5xl rounded-[18px] bg-ink p-1.5 shadow-[0_10px_0_rgb(0_0_0/0.18)] focus-within:ring-4 focus-within:ring-mustard/50">
          <div className="flex items-start gap-3 px-4 pt-3.5">
            <span className="mt-0.5 font-mono text-[18px] text-mustard">›</span>
            <textarea value={problem} onChange={e => setProblem(e.target.value)} rows={3} maxLength={2000}
              placeholder="e.g. Revenue fell 18% in September compared with August. Find the root cause."
              className="min-h-[84px] flex-1 resize-y bg-transparent font-mono text-[14.5px] leading-relaxed text-paper outline-none placeholder:text-paper/35" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-paper/10 px-3 py-2.5">
            <span className="px-1 text-[12px] text-paper/50">Simple lookups (“top 10…”, “how many…”) go to <b className="font-medium text-paper/80">Ask</b>.</span>
            <button onClick={go} disabled={!problem.trim() || !dataset || starting || running}
              className="group flex h-11 items-center gap-2 rounded-[12px] bg-mustard px-6 font-label text-[12px] font-bold uppercase tracking-[0.08em] text-ink shadow-[0_4px_0_rgb(0_0_0/0.3)] transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50">
              {running || starting ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-ink/30 border-t-ink" /> Investigating</> :
                <>Investigate with {MODE_LABEL[mode]} <Arrow className="h-4 w-4 transition-transform group-hover:rotate-45" /></>}
            </button>
          </div>
        </div>
        {startError && <div className="relative mt-3 max-w-5xl"><ErrorNote error={startError} /></div>}

        {/* system picker */}
        <div className="relative mt-6 grid max-w-5xl gap-2 sm:grid-cols-3">
          {(['C', 'B', 'A'] as Mode[]).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={clsx('group relative overflow-hidden rounded-[16px] border-2 p-4 text-left transition',
                mode === m ? 'border-transparent text-ink' : 'border-paper/25 text-paper hover:border-paper/70')}
              style={mode === m ? { background: MODE_BG[m] } : undefined}>
              <div className="flex items-baseline gap-3">
                <span className="font-display text-[34px] leading-none">{m}</span>
                <span className="font-label text-[11px] font-bold uppercase tracking-[0.08em]"><Term t={`System ${m}`}>{MODE_LABEL[m]}</Term></span>
                {m === 'C' && <span className="ml-auto rounded-full bg-ink px-2 py-0.5 font-label text-[9px] font-bold uppercase text-mustard">ours</span>}
              </div>
              <p className={clsx('mt-2 text-[12.5px] leading-snug', mode === m ? 'text-ink/80' : 'text-paper/65')}>{MODE_PLAIN[m]}</p>
            </button>
          ))}
        </div>
        {mode === 'B' && tables.length > 0 && (
          <div className="relative mt-3 max-w-5xl animate-fade-in rounded-[14px] bg-paper/10 p-3.5">
            <div className="mb-2 font-label text-[10px] font-bold uppercase tracking-[0.12em] text-blush">Analyst allowlist · tables the AI may read in full</div>
            <div className="flex flex-wrap gap-1.5">
              {tables.map(t => {
                const on = allowTables.includes(t)
                return (
                  <button key={t} onClick={() => setAllowTables(on ? allowTables.filter(x => x !== t) : [...allowTables, t])}
                    className={clsx('rounded-[8px] px-2.5 py-1 font-mono text-[12px] transition', on ? 'bg-tangerine text-paper' : 'bg-paper/10 text-paper/70 hover:bg-paper/20')}>
                    {on ? '✓ ' : ''}{t}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </section>

      {pending && run && (
        <ApprovalBanner runId={run.id} ask={pending as never} onDone={() => setAnswered(a => [...a, `${run.id}:${pending.hypothesis}`])} />
      )}

      {!run ? (
        <Empty title="Nothing running yet" text="Pick a suggested problem or write your own, choose a system, and press Investigate. Every guess, key, query and verdict streams in live." />
      ) : (
        <>
          <div className="sticky top-[76px] z-20"><Narrator events={events} running={running} /></div>

          {/* ------------------------------------------------ live counters */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {(direct ? [
              ['Queries run', counts.queries, C.ink, C.paper],
              ['Columns open', counts.columns, C.scarlet, C.paper],
              ['Errors', steps.filter(s => s.error).length, C.oxblood, C.paper],
              ['Rule checks', 0, '#e2dbd5', C.ink],
              ['Verdicts by code', 0, '#e2dbd5', C.ink],
              ['Injections caught', 0, '#e2dbd5', C.ink],
            ] : [
              ['Guesses', hyps.length, C.ink, C.paper],
              ['Keys issued', counts.grants, C.mustard, C.ink],
              ['Columns ever open', counts.columns, C.blush, C.ink],
              ['Blocked', counts.denials, C.scarlet, C.paper],
              ['Injections caught', counts.injections, C.tangerine, C.paper],
              ['Supported', counts.supported, '#2e7046', C.paper],
            ]).map(([label, v, bg, fg]) => (
              <div key={label as string} className="rounded-[16px] px-4 py-3.5" style={{ background: bg as string, color: fg as string }}>
                <div className="font-display text-[34px] leading-none"><CountUp value={v as number} /></div>
                <div className="mt-1.5 font-label text-[9.5px] font-bold uppercase tracking-[0.12em] opacity-85">{label}</div>
              </div>
            ))}
          </div>

          {/* ------------------------------------------------ provenance graph */}
          {!direct && (
            <Panel title="Evidence graph" kicker="live provenance" sub="Every guess, the key it got, the queries it ran and the verdict code reached. Pulsing lines are the guess being tested right now.">
              {hyps.length === 0 ? <Wait /> : <ProvenanceGraph events={events} hyps={hyps} current={current} problem={run.problem} />}
              <Legend items={[['Proposed', '#cfc6be'], ['Testing', C.ink], ['Supported', '#2e7046'], ['Rejected', C.scarlet], ['Unsure', C.mustard], ['Blocked', C.oxblood]]} />
            </Panel>
          )}

          <div className="grid gap-6 xl:grid-cols-5">
            <Panel className="xl:col-span-3" title="Permission timeline" kicker="capability gantt"
              sub={direct ? 'One key, open the whole time. Compare with InvestiGuard, where keys are short and narrow.'
                : 'Each bar is one key: when it was issued and when it was destroyed. Crosses are blocks, bolts are injections caught.'}>
              <CapabilityGantt events={events} running={running} hyps={hyps} />
            </Panel>
            <Panel className="xl:col-span-2" title="Security alerts" kicker="what got stopped" sub="Rules, gateway and firewall, explained in plain words.">
              <SecurityFeed events={events} />
            </Panel>
          </div>

          <div className="grid gap-6 xl:grid-cols-5">
            <Panel className="xl:col-span-3" title={direct ? 'What the AI looked at' : 'Guesses'}
              kicker={direct ? 'free-form queries' : 'ranked by usefulness ÷ privilege cost'}
              sub={direct ? 'Chosen by the AI, judged by the AI. No per-query permission.' : 'Cheaper, less sensitive guesses are tested first. Open one to see the columns it declared.'}>
              <div className="space-y-2">
                {(direct ? steps.length : hyps.length) === 0 && <Wait />}
                {direct ? steps.map(s => <StepCard key={s.id} s={s} />)
                  : [...hyps].sort((a, b) => b.priority - a.priority).map(h => <HypothesisCard key={h.id} h={h} active={h.id === current} />)}
              </div>
            </Panel>
            <Panel className="xl:col-span-2" title="Event log" kicker="every decision" sub="The raw sequence, as sealed into the receipt.">
              <Timeline events={events} />
            </Panel>
          </div>

          {run.status === 'error' && <ErrorNote error={run.error ?? 'Investigation failed'} />}
          {run.investigation?.result && <ReportView inv={run.investigation} />}
        </>
      )}
    </div>
  )
}

function Panel({ title, kicker, sub, children, className }: { title: string; kicker: string; sub?: string; children: ReactNode; className?: string }) {
  return (
    <section className={clsx('card overflow-hidden', className)}>
      <div className="flex flex-wrap items-end justify-between gap-2 border-b-[1.5px] border-line px-5 pb-3 pt-4">
        <div>
          <div className="font-label text-[9.5px] font-bold uppercase tracking-[0.14em] text-oxblood">{kicker}</div>
          <h2 className="display mt-1 text-[22px] text-ink">{title}</h2>
          {sub && <p className="mt-1 max-w-2xl text-[12.5px] leading-snug text-muted">{sub}</p>}
        </div>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  )
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-3 font-label text-[9.5px] font-bold uppercase tracking-[0.08em] text-muted">
      {items.map(([l, c]) => <span key={l} className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px]" style={{ background: c }} />{l}</span>)}
    </div>
  )
}

function Wait() {
  return <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-16 animate-pulse rounded-[12px] bg-sunken" style={{ animationDelay: `${i * 120}ms` }} />)}</div>
}

function StepCard({ s }: { s: DirectStep }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="animate-fade-in rounded-[14px] border-[1.5px] border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="rounded-[6px] bg-ink px-1.5 py-0.5 font-mono text-[11px] text-paper">{s.id}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] leading-snug text-fg">{s.thought}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
            {s.error ? <span className="text-scarlet">{s.error}</span> : <><span>{s.rows} rows ·</span>{s.columns.map(c => <Chip key={c} mono>{c.split('.').pop()}</Chip>)}</>}
          </div>
          <button onClick={() => setOpen(o => !o)} className="mt-2 flex items-center gap-1 text-[11.5px] text-subtle hover:text-fg">
            <ChevronRight className={clsx('h-3 w-3 transition', open && 'rotate-90')} /> SQL
          </button>
          {open && <pre className="mt-2 overflow-x-auto rounded-[10px] bg-ink p-3 font-mono text-[11.5px] text-paper/90">{s.sql}</pre>}
        </div>
      </div>
    </div>
  )
}

const STRIPE: Record<string, string> = { SUPPORTED: '#2e7046', REJECTED: C.scarlet, INCONCLUSIVE: C.mustard, TESTING: C.ink, BLOCKED: C.oxblood, PROPOSED: '#cfc6be' }

function HypothesisCard({ h, active }: { h: Hypothesis; active: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={clsx('relative animate-fade-in overflow-hidden rounded-[14px] border-[1.5px] bg-surface p-4 pl-5 transition',
      active ? 'border-ink shadow-[0_4px_0_var(--color-mustard)]' : 'border-line')}>
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: STRIPE[h.status] ?? STRIPE.PROPOSED }} />
      <div className="flex items-start gap-4">
        <span className="mt-0.5 rounded-[6px] bg-ink px-1.5 py-0.5 font-mono text-[11px] text-paper">{h.id}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={h.status} />
            {active && <span className="font-label text-[9.5px] font-bold uppercase tracking-[0.1em] text-oxblood">testing now</span>}
            {h.parent && <Chip>follow-up of {h.parent}</Chip>}
            {h.kind === 'timeline' && <Chip>timing · added by code</Chip>}
            {h.kind === 'price_volume' && <Chip>price vs volume · added by code</Chip>}
            {h.blocked_reason && <Chip tone="warn">blocked by {CHECK_PLAIN[h.blocked_reason] ?? h.blocked_reason}</Chip>}
            {h.status === 'SUPPORTED' && h.explained_share > 0 && <Chip tone="accent">explains {(h.explained_share * 100).toFixed(0)}%</Chip>}
            {h.evidence_score != null && <Chip><Term t="evidence score">score {h.evidence_score.toFixed(2)}</Term></Chip>}
          </div>
          <p className="mt-2 text-[13.5px] leading-snug text-fg">{h.statement}</p>
          {h.finding && <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{h.finding}</p>}
          {h.score_parts && (
            <div className="mt-2 flex gap-3">
              {(['E', 'S', 'T'] as const).map(k => (
                <div key={k} className="flex items-center gap-1.5 font-mono text-[10.5px] text-muted">
                  {k}<span className="h-1.5 w-12 overflow-hidden rounded-full bg-sunken"><span className="block h-full bg-oxblood" style={{ width: `${h.score_parts![k] * 100}%` }} /></span>{h.score_parts![k].toFixed(2)}
                </div>
              ))}
            </div>
          )}
          <button onClick={() => setOpen(o => !o)} className="mt-2 flex items-center gap-1 text-[11.5px] text-subtle hover:text-fg">
            <ChevronRight className={clsx('h-3 w-3 transition', open && 'rotate-90')} /> {h.resources.length} declared columns
          </button>
          {open && <div className="mt-2 flex flex-wrap gap-1">{h.resources.map(r => <Chip key={r} mono>{r}</Chip>)}</div>}
        </div>
        <div className="w-20 shrink-0 text-right">
          <div className="eyebrow">Priority</div>
          <div className="mt-1 font-display text-[18px] text-ink">{h.priority.toFixed(2)}</div>
          <div className="text-[10.5px] text-subtle">privilege cost {h.privilege_cost}</div>
        </div>
      </div>
    </div>
  )
}

const DOT: Record<string, string> = {
  cap_granted: C.mustard, policy_denied: C.oxblood, gateway_denied: C.scarlet, injection_blocked: C.tangerine,
  query_ok: '#2e7046', cap_revoked: '#b9ada4', stop: C.ink, approval_requested: C.mustard, evidence: C.ink, direct_step: C.tangerine,
}

function Timeline({ events }: { events: IgEvent[] }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: 'smooth' }) }, [events.length])
  const t0 = events[0]?.t ?? 0
  const items = events.map((ev, i) => ({ ev, i, s: (ev.kind === 'hypothesis_status' ? `${ev.hypothesis.id} → ${ev.hypothesis.status}` : null) })).filter(x => DOT[x.ev.kind] || x.s)
  return (
    <div ref={box} className="max-h-[560px] min-h-[200px] overflow-y-auto pr-1">
      {items.length === 0 && <Wait />}
      <ol className="relative before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-[2px] before:bg-line">
        {items.map(({ ev, i, s }) => (
          <li key={i} className="relative flex animate-fade-in gap-3 py-1.5">
            <span className="relative z-10 mt-1.5 h-3 w-3 shrink-0 rounded-full border-2 border-surface" style={{ background: DOT[ev.kind] ?? C.blush }} />
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="font-label text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink">{ev.kind.replace(/_/g, ' ')}</span>
                <span className="font-mono text-[10px] text-subtle">+{(ev.t - t0).toFixed(1)}s</span>
              </div>
              <div className="text-[12.5px] leading-snug text-fg-2">{s ?? narrateShort(ev)}</div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

function narrateShort(ev: IgEvent): string {
  switch (ev.kind) {
    case 'cap_granted': return ev.resources?.['*'] ? 'whole database opened' : `${ev.hypothesis}: ${Object.keys(ev.resources ?? {}).map(r => r.split('.').pop()).join(', ')} · ${ev.ttl_s}s`
    case 'policy_denied': return `${ev.hypothesis}: ${ev.check} ${ev.reason}`
    case 'gateway_denied': return `${ev.hypothesis}: ${ev.reason}`
    case 'injection_blocked': return `${ev.count} cell(s) masked in ${ev.columns.join(', ')}`
    case 'query_ok': return `${ev.rows} rows · ${ev.columns.length} columns checked in ${Number(ev.latency_ms).toFixed(1)} ms`
    case 'cap_revoked': return `${ev.hypothesis} key destroyed (${ev.reason})`
    case 'evidence': return `${ev.evidence.id} for ${ev.evidence.hypothesis}: ${ev.evidence.verdict}`
    case 'approval_requested': return `${ev.hypothesis} waits for you (${ev.check})`
    case 'direct_step': return ev.done ? 'AI says it is done' : `${ev.step}: ${ev.thought}`
    case 'stop': return ev.reason
    default: return ''
  }
}
