/** Agent Studio pieces: live provenance graph, capability timeline, security feed, narrator, count-ups. */
import clsx from 'clsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Hypothesis, IgEvent } from '../api'
import { C } from './brand'

export const CHECK_PLAIN: Record<string, string> = {
  P1: 'read-only rule', P2: 'sensitivity rule', P3: 'declared-columns rule', P4: 'evidence-first rule', P5: 'budget rule',
}
const STATUS_FILL: Record<string, string> = {
  SUPPORTED: '#2e7046', REJECTED: C.scarlet, INCONCLUSIVE: C.mustard, TESTING: C.ink, BLOCKED: C.oxblood, PROPOSED: '#cfc6be',
}
const STATUS_TEXT: Record<string, string> = { INCONCLUSIVE: C.ink, PROPOSED: C.ink }

export function deriveHypotheses(events: IgEvent[]) {
  const hyps: Record<string, Hypothesis> = {}
  let current: string | null = null
  for (const ev of events) {
    if (ev.kind === 'hypothesis_proposed' || ev.kind === 'hypothesis_status') hyps[ev.hypothesis.id] = { ...hyps[ev.hypothesis.id], ...ev.hypothesis }
    if (ev.kind === 'plan') current = ev.hypothesis
    if (ev.kind === 'cap_granted' && hyps[ev.hypothesis]) hyps[ev.hypothesis].status = 'TESTING'
    if (ev.kind === 'policy_denied' && hyps[ev.hypothesis]) hyps[ev.hypothesis].status = 'BLOCKED'
    if (ev.kind === 'stop') current = null
  }
  return { hyps: Object.values(hyps), current }
}

/* ------------------------------------------------------------------ count-up number */

export function CountUp({ value, className, suffix = '' }: { value: number; className?: string; suffix?: string }) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const start = from.current, t0 = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 600)
      const v = start + (value - start) * (1 - Math.pow(1 - p, 3))
      setShown(v)
      if (p < 1) raf = requestAnimationFrame(tick)
      else from.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])
  const dec = Number.isInteger(value) ? 0 : 1
  return <span className={clsx('tabular-nums', className)}>{shown.toFixed(dec)}{suffix}</span>
}

/* ------------------------------------------------------------------ narrator */

/** One plain-English sentence for an event, or null when the event is not worth narrating. */
export function narrate(ev: IgEvent): string | null {
  const n = (r: Record<string, string> | undefined) => Object.keys(r ?? {}).length
  switch (ev.kind) {
    case 'objective': return 'Reading the question: which number moved, by how much, and between which dates.'
    case 'hypothesis_proposed': return ev.hypothesis.auto
      ? `Code adds a follow-up check: ${ev.hypothesis.statement}`
      : `New guess ${ev.hypothesis.id}: ${ev.hypothesis.statement}`
    case 'plan': return `Next up: ${ev.hypothesis}. It is the most useful guess for the least sensitive data right now.`
    case 'cap_granted': return ev.resources?.['*'] ? 'The AI was handed the whole database, with no limits.'
      : Object.keys(ev.resources ?? {}).some(k => k.endsWith('.*')) ? `The AI was handed every column of the allowed tables for the whole run.`
      : `Permission granted to ${ev.hypothesis}: ${n(ev.resources)} columns, for ${ev.ttl_s} seconds. Everything else stays hidden.`
    case 'policy_denied': return `Blocked by the ${CHECK_PLAIN[ev.check] ?? ev.check}: ${ev.reason}.`
    case 'approval_requested': return `Waiting for you: ${ev.hypothesis} needs an exception to the ${CHECK_PLAIN[ev.check] ?? ev.check}.`
    case 'approval_decided': return ev.approved ? `You allowed ${ev.hypothesis} once, for two minutes.` : `You said no to ${ev.hypothesis}.`
    case 'query_written': return `The AI wrote a query for ${ev.hypothesis}. The gateway is checking every column in it…`
    case 'query_ok': return `The query passed the checks and ran: ${ev.rows} rows came back.`
    case 'gateway_denied': return `The gateway refused a query: ${ev.reason}.`
    case 'sql_error': return `That query did not work (${String(ev.error).slice(0, 80)}). The AI is trying again.`
    case 'injection_blocked': return `Caught ${ev.count} piece${ev.count > 1 ? 's' : ''} of text in the data trying to give the AI orders, and blanked ${ev.count > 1 ? 'them' : 'it'} out.`
    case 'evidence': {
      const e = ev.evidence
      return e.verdict === 'SUPPORTED' ? `The maths says yes: ${e.hypothesis} explains ${(e.explained_share * 100).toFixed(0)}% of the change.`
        : e.verdict === 'REJECTED' ? `The maths says no: ${e.hypothesis} does not explain the change.`
          : `The maths is unsure about ${e.hypothesis}.`
    }
    case 'cap_revoked': return `Permission for ${ev.hypothesis} destroyed. It cannot be reused.`
    case 'direct_step': return ev.done ? 'The AI says it has the answer. Nothing will check it.' : `The AI runs ${ev.step}: ${ev.thought}`
    case 'stop': return `Stopping: ${ev.reason}.`
    case 'report': return 'Report written. Any sentence without evidence behind it was deleted.'
    default: return null
  }
}

export function Narrator({ events, running }: { events: IgEvent[]; running: boolean }) {
  const line = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) { const s = narrate(events[i]); if (s) return { s, i } }
    return { s: running ? 'Starting up…' : 'Ready.', i: -1 }
  }, [events, running])
  const [chars, setChars] = useState(0)
  useEffect(() => {
    setChars(0)
    const id = setInterval(() => setChars(c => (c >= line.s.length ? (clearInterval(id), c) : c + 2)), 14)
    return () => clearInterval(id)
  }, [line])
  return (
    <div className="flex items-center gap-4 rounded-[16px] bg-ink px-5 py-3.5 text-paper">
      <span className="relative flex h-3 w-3 shrink-0">
        {running && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mustard opacity-75" />}
        <span className={clsx('relative inline-flex h-3 w-3 rounded-full', running ? 'bg-mustard' : 'bg-good')} />
      </span>
      <span className="shrink-0 font-label text-[10px] font-bold uppercase tracking-[0.14em] text-blush">{running ? 'Live' : 'Done'}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-[13.5px]">
        {line.s.slice(0, chars)}<span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-[caret_1s_steps(1)_infinite] bg-mustard" />
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ provenance graph */

interface Row { h: Hypothesis; cap?: IgEvent; denied?: IgEvent; queries: number; blocked: number; evidence?: any; revoked: boolean }

function rows(events: IgEvent[], hyps: Hypothesis[]): Row[] {
  const by: Record<string, Row> = {}
  for (const h of hyps) by[h.id] = { h, queries: 0, blocked: 0, revoked: false }
  for (const ev of events) {
    const r = by[ev.hypothesis] ?? (ev.evidence && by[ev.evidence.hypothesis])
    if (!r) continue
    if (ev.kind === 'cap_granted') { r.cap = ev; r.denied = undefined }
    if (ev.kind === 'policy_denied') r.denied = ev
    if (ev.kind === 'query_ok') r.queries++
    if (ev.kind === 'gateway_denied') r.blocked++
    if (ev.kind === 'evidence') r.evidence = ev.evidence
    if (ev.kind === 'cap_revoked') r.revoked = true
  }
  return Object.values(by).sort((a, b) => Number(a.h.id.slice(1)) - Number(b.h.id.slice(1)))
}

/** Problem → hypothesis → capability → query → evidence, drawn live as the run streams in. */
export function ProvenanceGraph({ events, hyps, current, problem }: { events: IgEvent[]; hyps: Hypothesis[]; current: string | null; problem: string }) {
  const data = useMemo(() => rows(events, hyps), [events, hyps])
  const RH = 54, TOP = 46, W = 1120
  const H = Math.max(220, TOP + data.length * RH + 16)
  const X = [20, 230, 610, 790, 950]
  const midY = TOP + (data.length * RH) / 2 - 6
  const node = (x: number, y: number, w: number, fill: string, text: string, sub: string | null, color = C.paper, key = '', glow = false) => (
    <g key={key} transform={`translate(${x},${y})`}><g className="animate-[pop_.45s_cubic-bezier(.2,.8,.2,1)_both]" style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
      {glow && <rect x={-4} y={-4} width={w + 8} height={44} rx={13} fill="none" stroke={C.mustard} strokeWidth={3} className="animate-pulse" />}
      <rect width={w} height={36} rx={10} fill={fill} />
      <text x={12} y={sub ? 15 : 22} fill={color} fontSize={12} fontWeight={700} fontFamily="Space Mono, monospace">{text}</text>
      {sub && <text x={12} y={29} fill={color} opacity={0.8} fontSize={10.5} fontFamily="Geist, sans-serif">{sub}</text>}
    </g></g>
  )
  const edge = (x1: number, y1: number, x2: number, y2: number, live: boolean, color: string = C.ink, dashed = false, key = '') => {
    const mx = (x1 + x2) / 2
    return <path key={key} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} fill="none" stroke={color}
      strokeWidth={live ? 2.4 : 1.4} strokeOpacity={live ? 1 : 0.45} strokeDasharray={live || dashed ? '6 5' : undefined}
      className={live ? 'animate-[dash_1s_linear_infinite]' : undefined} />
  }
  const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[860px]" style={{ width: '100%', height: 'auto' }}>
        {['Problem', 'Hypothesis (guess)', 'Permission key', 'Query', 'Evidence · verdict'].map((t, i) => (
          <text key={t} x={X[i]} y={20} fontSize={10} fontWeight={700} letterSpacing="0.12em" fill="#776c63" fontFamily="Space Mono, monospace">{t.toUpperCase()}</text>
        ))}
        {data.map((r, i) => {
          const y = TOP + i * RH + 18
          const live = r.h.id === current
          return (
            <g key={r.h.id}>
              {edge(X[0] + 170, midY + 18, X[1], y, live, C.ink, false, 'e0')}
              {(r.cap || r.denied) && edge(X[1] + 350, y, X[2], y, live, r.denied ? C.scarlet : C.ink, !!r.denied, 'e1')}
              {r.cap && (r.queries > 0 || r.blocked > 0) && edge(X[2] + 150, y, X[3], y, live, r.blocked && !r.queries ? C.scarlet : C.ink, false, 'e2')}
              {r.evidence && edge(X[3] + 130, y, X[4], y, live, C.ink, false, 'e3')}
            </g>
          )
        })}
        {node(X[0], midY, 170, C.oxblood, 'PROBLEM', trunc(problem, 26), C.paper, 'p')}
        {data.map((r, i) => {
          const y = TOP + i * RH
          const live = r.h.id === current
          const fill = STATUS_FILL[r.h.status] ?? STATUS_FILL.PROPOSED
          const kcount = r.cap ? Object.keys(r.cap.resources ?? {}).length : 0
          return (
            <g key={r.h.id}>
              {node(X[1], y, 350, fill, `${r.h.id} · ${r.h.status}`, trunc(r.h.statement, 58), STATUS_TEXT[r.h.status] ?? C.paper, 'h', live)}
              {r.denied && node(X[2], y, 150, C.scarlet, `DENIED ${r.denied.check}`, CHECK_PLAIN[r.denied.check] ?? '', C.paper, 'd')}
              {r.cap && node(X[2], y, 150, r.revoked ? '#e2dbd5' : C.mustard, r.revoked ? 'KEY REVOKED' : `KEY · ${r.cap.ttl_s}s`,
                `${kcount} column${kcount === 1 ? '' : 's'}${r.cap.approved_by_analyst ? ' · approved' : ''}`, C.ink, 'k')}
              {r.cap && (r.queries > 0 || r.blocked > 0) && node(X[3], y, 130, r.queries ? C.ink : C.scarlet,
                `${r.queries} QUER${r.queries === 1 ? 'Y' : 'IES'}`, r.blocked ? `${r.blocked} blocked` : 'checked', C.paper, 'q')}
              {r.evidence && node(X[4], y, 150, STATUS_FILL[r.evidence.verdict], `${r.evidence.id} · ${r.evidence.verdict.slice(0, 9)}`,
                r.evidence.explained_share ? `explains ${(r.evidence.explained_share * 100).toFixed(0)}%` : r.h.kind?.replace('_', ' ') ?? '',
                STATUS_TEXT[r.evidence.verdict] ?? C.paper, 'ev')}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/* ------------------------------------------------------------------ capability timeline (Gantt) */

/** When each permission key existed, per hypothesis: the synopsis's Figure 5.3, live. */
export function CapabilityGantt({ events, running, hyps }: { events: IgEvent[]; running: boolean; hyps: Hypothesis[] }) {
  const [now, setNow] = useState(() => Date.now() / 1000)
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setNow(Date.now() / 1000), 500)
    return () => clearInterval(id)
  }, [running])
  const t0 = events[0]?.t ?? now
  const end = running ? now : events[events.length - 1]?.t ?? now
  const span = Math.max(0.5, end - t0)
  const status = Object.fromEntries(hyps.map(h => [h.id, h.status]))
  type Bar = { id: string; start: number; stop: number | null; cols: number; label: string; approved?: boolean }
  const bars: Bar[] = []
  const marks: { id: string; t: number; kind: 'deny' | 'gate' | 'inject'; tip: string }[] = []
  for (const ev of events) {
    if (ev.kind === 'cap_granted') {
      const res = ev.resources ?? {}
      bars.push({ id: ev.hypothesis, start: ev.t, stop: null, cols: Object.keys(res).length,
        label: res['*'] ? 'every column' : Object.keys(res).map(r => r.split('.').pop()).join(', '), approved: ev.approved_by_analyst })
    }
    if (ev.kind === 'cap_revoked') { const b = [...bars].reverse().find(x => x.id === ev.hypothesis && x.stop == null); if (b) b.stop = ev.t }
    if (ev.kind === 'policy_denied') marks.push({ id: ev.hypothesis, t: ev.t, kind: 'deny', tip: `${ev.check}: ${ev.reason}` })
    if (ev.kind === 'gateway_denied') marks.push({ id: ev.hypothesis, t: ev.t, kind: 'gate', tip: ev.reason })
    if (ev.kind === 'injection_blocked') marks.push({ id: ev.hypothesis, t: ev.t, kind: 'inject', tip: 'instructions masked' })
  }
  const ids = [...new Set([...bars.map(b => b.id), ...marks.map(m => m.id)])].filter(Boolean)
  if (!ids.length) return <div className="grid h-40 place-items-center text-sm text-muted">Keys appear here the moment they are granted.</div>
  const W = 900, L = 170, RH = 30, H = 30 + ids.length * RH + 10
  const x = (t: number) => L + ((t - t0) / span) * (W - L - 20)
  const ticks = Array.from({ length: 6 }, (_, i) => (span * i) / 5)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      {ticks.map(s => (
        <g key={s}>
          <line x1={x(t0 + s)} x2={x(t0 + s)} y1={18} y2={H - 6} stroke="#ddd4cc" strokeDasharray="3 4" />
          <text x={x(t0 + s)} y={12} fontSize={9.5} textAnchor="middle" fill="#776c63" fontFamily="Space Mono, monospace">{s.toFixed(0)}s</text>
        </g>
      ))}
      {ids.map((id, i) => {
        const y = 26 + i * RH
        const st = status[id] ?? (id === 'AI' ? 'TESTING' : 'PROPOSED')
        return (
          <g key={id}>
            <text x={8} y={y + 15} fontSize={11.5} fontWeight={700} fill={C.ink} fontFamily="Space Mono, monospace">{id}</text>
            <text x={44} y={y + 15} fontSize={10} fill="#776c63" fontFamily="Geist, sans-serif">{(hyps.find(h => h.id === id)?.driver ?? (id === 'AI' ? 'whole run' : '')).slice(0, 18)}</text>
            {bars.filter(b => b.id === id).map((b, j) => {
              const x1 = x(b.start), x2 = x(b.stop ?? end)
              return (
                <g key={j}>
                  <rect x={x1} y={y + 3} width={Math.max(4, x2 - x1)} height={RH - 10} rx={6}
                    fill={b.stop == null ? C.mustard : STATUS_FILL[st] ?? C.ink} stroke={b.approved ? C.oxblood : 'none'} strokeWidth={2}
                    className={b.stop == null ? 'animate-pulse' : undefined}>
                    <title>{`${id}: ${b.cols} column(s): ${b.label}`}</title>
                  </rect>
                  {x2 - x1 > 70 && <text x={x1 + 7} y={y + 17} fontSize={10} fill={b.stop == null || st === 'INCONCLUSIVE' ? C.ink : C.paper} fontFamily="Space Mono, monospace">{b.cols} col · {((b.stop ?? end) - b.start).toFixed(1)}s</text>}
                </g>
              )
            })}
            {marks.filter(m => m.id === id).map((m, j) => (
              <g key={`m${j}`} transform={`translate(${x(m.t)},${y + RH / 2 - 2})`}>
                <title>{m.tip}</title>
                {m.kind === 'inject'
                  ? <path d="M-2 -9 L4 -1 L0 -1 L2 9 L-4 1 L0 1 Z" fill={C.tangerine} stroke={C.ink} strokeWidth={1} />
                  : <g stroke={m.kind === 'deny' ? C.scarlet : C.oxblood} strokeWidth={3} strokeLinecap="round"><path d="M-6 -6 L6 6 M6 -6 L-6 6" /></g>}
              </g>
            ))}
          </g>
        )
      })}
      {running && <line x1={x(end)} x2={x(end)} y1={18} y2={H - 6} stroke={C.scarlet} strokeWidth={1.5} />}
    </svg>
  )
}

/* ------------------------------------------------------------------ security feed */

const SEC_KINDS = new Set(['policy_denied', 'gateway_denied', 'injection_blocked', 'approval_requested', 'approval_decided'])

export function SecurityFeed({ events }: { events: IgEvent[] }) {
  const items = events.filter(e => SEC_KINDS.has(e.kind)).reverse()
  const count = (k: string) => events.filter(e => e.kind === k).length
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {[['Rule blocks', count('policy_denied'), C.oxblood], ['Query blocks', count('gateway_denied'), C.scarlet], ['Injections caught', count('injection_blocked'), C.tangerine]].map(([l, v, bg]) => (
          <div key={l as string} className="rounded-[12px] px-3 py-2.5 text-paper" style={{ background: bg as string }}>
            <div className="font-display text-[26px] leading-none"><CountUp value={v as number} /></div>
            <div className="mt-1 font-label text-[9px] font-bold uppercase tracking-[0.1em] opacity-90">{l}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 max-h-[300px] space-y-2 overflow-y-auto pr-1">
        {items.length === 0 && <div className="rounded-[12px] border-2 border-dashed border-line-strong px-4 py-6 text-center text-[13px] text-muted">
          All quiet. Anything the rules, the gateway or the firewall stops shows up here.</div>}
        {items.map((e, i) => {
          const tone = e.kind === 'approval_decided' ? (e.approved ? 'bg-good-soft border-good/40' : 'bg-sunken border-line')
            : e.kind === 'approval_requested' ? 'bg-warn-soft border-warn/40' : 'bg-bad-soft border-scarlet/40'
          return (
            <div key={`${e.t}-${i}`} className={clsx('animate-[pop_.4s_both] rounded-[12px] border-l-4 px-3.5 py-2.5', tone)}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-label text-[10px] font-bold uppercase tracking-[0.1em] text-ink">
                  {e.kind === 'policy_denied' ? `Rule ${e.check} · ${CHECK_PLAIN[e.check] ?? ''}` : e.kind === 'gateway_denied' ? 'SQL gateway'
                    : e.kind === 'injection_blocked' ? 'Injection firewall' : e.kind === 'approval_requested' ? 'Needs your OK' : 'Your decision'}
                </span>
                <span className="font-mono text-[10.5px] text-muted">{e.hypothesis}</span>
              </div>
              <p className="mt-1 text-[12.5px] leading-snug text-fg-2">{narrate(e)}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
