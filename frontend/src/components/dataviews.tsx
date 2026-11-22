/** Data page panels: quality, relationship map, privacy scan, ingest log, answer key. */
import clsx from 'clsx'
import { useEffect, useMemo, useState } from 'react'
import { api, type AnswerKey, type IngestReport, type PiiScan, type QualityReport, type SchemaMap, type TableQuality } from '../api'
import { go } from '../App'
import { Arrow, C } from './brand'
import { Term } from './gloss'
import { CountUp } from './studio'
import { ErrorNote, pct } from './ui'

const SENS: Record<string, string> = { public: '#cfc6be', internal: C.blush, confidential: C.mustard, restricted: C.scarlet }
const fmtN = (n: number) => Intl.NumberFormat('en-US', { notation: n >= 1e5 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(n)

function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let live = true
    setData(null); setError(null)
    fn().then(d => live && setData(d)).catch(e => live && setError((e as Error).message))
    return () => { live = false }
  }, [...deps, tick]) // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error, reload: () => setTick(t => t + 1) }
}

export function Loading({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[16px] bg-sunken px-5 py-8 text-[13px] text-muted">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-ink/20 border-t-ink" />{text}
    </div>
  )
}

/* ------------------------------------------------------------------ quality */

export function QualityPanel({ ds }: { ds: string }) {
  const { data, error } = useLoad<QualityReport>(() => api.quality(ds), [ds])
  const [open, setOpen] = useState<string | null>(null)
  if (error) return <ErrorNote error={error} />
  if (!data) return <Loading text="Profiling every table (big tables are sampled)…" />
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-4">
        {[['Rows', data.rows, C.ink, C.paper], ['Columns', data.columns, C.blush, C.ink], ['Tables', data.tables.length, C.mustard, C.ink],
          ['Health score', data.score, data.score >= 85 ? '#2e7046' : C.tangerine, C.paper]].map(([l, v, bg, fg]) => (
          <div key={l as string} className="rounded-[16px] px-4 py-3.5" style={{ background: bg as string, color: fg as string }}>
            <div className="font-display text-[30px] leading-none">{l === 'Rows' ? fmtN(v as number) : <CountUp value={v as number} />}{l === 'Health score' && <span className="text-[16px]">/100</span>}</div>
            <div className="mt-1.5 font-label text-[9.5px] font-bold uppercase tracking-[0.12em] opacity-85">{l}</div>
          </div>
        ))}
      </div>
      <p className="text-[12px] text-muted">Profiled in {data.seconds}s by code on the database itself. Nothing here was sent to the AI. Values of sensitive columns are never shown.</p>
      <div className="grid gap-3 lg:grid-cols-2">
        {data.tables.map(t => <TableCard key={t.table} t={t} open={open === t.table} onToggle={() => setOpen(open === t.table ? null : t.table)} />)}
      </div>
    </div>
  )
}

function TableCard({ t, open, onToggle }: { t: TableQuality; open: boolean; onToggle: () => void }) {
  return (
    <div className={clsx('overflow-hidden rounded-[18px] border-[1.5px] bg-surface transition', open ? 'border-ink lg:col-span-2' : 'border-line')}>
      <button onClick={onToggle} className="flex w-full items-center gap-4 p-4 text-left hover:bg-blush/10">
        <Ring score={t.score} />
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[14px] font-semibold text-ink">{t.table}</div>
          <div className="mt-0.5 font-label text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
            {fmtN(t.rows)} rows · {t.columns} columns{!t.exact && ` · sampled ${fmtN(t.sampled)}`}{t.key_candidates.length > 0 && ` · key ${t.key_candidates[0]}`}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {t.issues.length === 0 && <span className="rounded-[5px] bg-good px-1.5 py-0.5 font-label text-[9px] font-bold uppercase text-paper">no issues</span>}
            {t.issues.slice(0, 4).map((i, k) => <span key={k} className="rounded-[5px] bg-warn-soft px-1.5 py-0.5 text-[11px] text-warn">{i.kind}: {i.column}</span>)}
            {t.issues.length > 4 && <span className="text-[11px] text-muted">+{t.issues.length - 4} more</span>}
          </div>
        </div>
        <span className={clsx('font-display text-[18px] transition', open && 'rotate-90')}>›</span>
      </button>
      {open && (
        <div className="animate-fade-in border-t-[1.5px] border-line">
          {t.issues.length > 0 && (
            <div className="space-y-1 border-b-[1.5px] border-line bg-warn-soft/40 px-4 py-3">
              {t.issues.map((i, k) => <div key={k} className="text-[12.5px] text-fg-2"><b className="font-mono text-ink">{i.column}</b> · {i.kind}: {i.detail}</div>)}
            </div>
          )}
          <div className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-3">
            {t.columns_detail.map(c => {
              const hidden = c.sensitivity === 'confidential' || c.sensitivity === 'restricted'
              return (
                <div key={c.column} className="bg-surface p-3.5">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SENS[c.sensitivity] }} title={c.sensitivity} />
                    <span className="truncate font-mono text-[12.5px] font-semibold text-ink">{c.column}</span>
                    <span className="ml-auto font-mono text-[10px] text-subtle">{c.type}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                    <Mini l="empty" v={pct(c.null_pct, 1)} bad={c.null_pct > 0.3} />
                    <Mini l="distinct" v={fmtN(c.distinct)} />
                    <Mini l="outliers" v={c.outlier_pct != null ? pct(c.outlier_pct, 1) : '–'} bad={(c.outlier_pct ?? 0) > 0.01} />
                  </div>
                  {hidden ? (
                    <div className="mt-2 rounded-[8px] bg-ink px-2.5 py-1.5 font-label text-[9.5px] font-bold uppercase tracking-[0.08em] text-mustard">{c.sensitivity} · values hidden</div>
                  ) : c.hist ? (
                    <div className="mt-2">
                      <div className="flex h-9 items-end gap-[2px]">{c.hist.map((h, i) => <span key={i} className="flex-1 rounded-t-[2px] bg-oxblood/70" style={{ height: `${(h / Math.max(...c.hist!, 1)) * 100}%` }} />)}</div>
                      <div className="mt-0.5 flex justify-between font-mono text-[9.5px] text-muted"><span>{fmtN(Number(c.min))}</span><span>avg {fmtN(Number(c.mean))}</span><span>{fmtN(Number(c.max))}</span></div>
                    </div>
                  ) : c.top ? (
                    <div className="mt-2 space-y-0.5">{c.top.slice(0, 3).map(v => (
                      <div key={v.value} className="flex items-center gap-1.5 text-[11px]">
                        <span className="w-24 truncate text-fg-2">{v.value || '(blank)'}</span>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken"><span className="block h-full bg-ink" style={{ width: `${v.share * 100}%` }} /></span>
                        <span className="w-9 text-right font-mono text-[10px] text-muted">{pct(v.share)}</span>
                      </div>))}
                      {c.min != null && <div className="font-mono text-[9.5px] text-muted">{String(c.min)} → {String(c.max)}</div>}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function Mini({ l, v, bad }: { l: string; v: string; bad?: boolean }) {
  return <div className={clsx('rounded-[7px] px-1 py-1', bad ? 'bg-bad-soft' : 'bg-sunken')}>
    <div className={clsx('font-mono text-[11.5px] font-semibold', bad ? 'text-scarlet' : 'text-ink')}>{v}</div>
    <div className="font-label text-[8.5px] uppercase tracking-[0.08em] text-muted">{l}</div></div>
}

function Ring({ score }: { score: number }) {
  const r = 20, L = 2 * Math.PI * r
  const col = score >= 90 ? '#2e7046' : score >= 75 ? C.mustard : C.scarlet
  return (
    <svg viewBox="0 0 52 52" className="h-14 w-14 shrink-0 -rotate-90">
      <circle cx={26} cy={26} r={r} fill="none" stroke="#e2dbd5" strokeWidth={6} />
      <circle cx={26} cy={26} r={r} fill="none" stroke={col} strokeWidth={6} strokeLinecap="round" strokeDasharray={`${(L * score) / 100} ${L}`} style={{ transition: 'stroke-dasharray .8s' }} />
      <text x={26} y={31} textAnchor="middle" transform="rotate(90 26 26)" fontSize={14} fontWeight={700} fill={C.ink} fontFamily="Space Mono, monospace">{score}</text>
    </svg>
  )
}

/* ------------------------------------------------------------------ relationship map */

export function SchemaPanel({ ds }: { ds: string }) {
  const { data, error } = useLoad<SchemaMap>(() => api.schema(ds), [ds])
  const [hover, setHover] = useState<string | null>(null)
  const layout = useMemo(() => {
    if (!data) return null
    const names = Object.keys(data.tables)
    const degree = Object.fromEntries(names.map(n => [n, data.edges.filter(e => e.from === n || e.to === n).length]))
    const order = [...names].sort((a, b) => degree[b] - degree[a])
    const W = 1100, H = Math.max(440, 140 + Math.ceil(names.length / 4) * 150)
    const pos: Record<string, [number, number]> = {}
    const hub = order[0]
    pos[hub] = [W / 2, H / 2]
    const ring = order.slice(1)
    ring.forEach((n, i) => {
      const a = (i / ring.length) * Math.PI * 2 - Math.PI / 2
      pos[n] = [W / 2 + Math.cos(a) * (W / 2 - 140), H / 2 + Math.sin(a) * (H / 2 - 70)]
    })
    return { W, H, pos }
  }, [data])
  if (error) return <ErrorNote error={error} />
  if (!data || !layout) return <Loading text="Finding how the tables link together…" />
  const { W, H, pos } = layout
  const BW = 190, BH = 70
  const lit = (t: string) => !hover || hover === t || data.edges.some(e => (e.from === hover && e.to === t) || (e.to === hover && e.from === t))
  return (
    <div>
      <p className="mb-3 text-[12.5px] text-muted">
        Links are found from column names and then <b className="text-ink">checked against the actual values</b>: the percentage is how many linked ids really exist in the other table.
        Hover a table to highlight its neighbours. A lock means the <Term t="evidence gate">evidence gate</Term> protects it.
      </p>
      <div className="overflow-x-auto rounded-[16px] bg-sunken/60">
        <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[760px]" style={{ width: '100%', height: 'auto' }}>
          <defs>
            <marker id="crow" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" orient="auto-start-reverse">
              <path d="M0,0 L11,6 L0,12 M11,0 L11,12" fill="none" stroke={C.ink} strokeWidth="1.4" />
            </marker>
            <marker id="one" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" orient="auto-start-reverse">
              <path d="M8,0 L8,12 M11,0 L11,12" fill="none" stroke={C.ink} strokeWidth="1.4" />
            </marker>
          </defs>
          {data.edges.map((e, i) => {
            const [x1, y1] = pos[e.from], [x2, y2] = pos[e.to]
            const on = !hover || hover === e.from || hover === e.to
            const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
            return (
              <g key={i} opacity={on ? 1 : 0.15} style={{ transition: 'opacity .25s' }}>
                <path d={`M${x1},${y1} L${x2},${y2}`} stroke={C.ink} strokeWidth={on && hover ? 2.4 : 1.4} fill="none"
                  strokeDasharray="6 5" className={on && hover ? 'animate-[dash_1s_linear_infinite]' : undefined} />
                <rect x={mx - 62} y={my - 11} width={124} height={22} rx={11} fill={C.paper} stroke={C.ink} />
                <text x={mx} y={my + 4} textAnchor="middle" fontSize={10.5} fontFamily="Space Mono, monospace" fill={C.ink}>
                  {e.column}{e.coverage != null ? ` · ${Math.round(e.coverage * 100)}%` : ''}
                </text>
              </g>
            )
          })}
          {Object.entries(data.tables).map(([t, info]) => {
            const [x, y] = pos[t]
            const sens = info.sensitive / Math.max(1, info.columns)
            return (
              <g key={t} transform={`translate(${x - BW / 2},${y - BH / 2})`} onMouseEnter={() => setHover(t)} onMouseLeave={() => setHover(null)}
                opacity={lit(t) ? 1 : 0.3} style={{ transition: 'opacity .25s', cursor: 'pointer' }}>
                <rect width={BW} height={BH} rx={14} fill={info.gate ? C.oxblood : C.ink} stroke={hover === t ? C.mustard : 'none'} strokeWidth={3} />
                <text x={14} y={24} fontSize={13} fontWeight={700} fill={C.paper} fontFamily="Space Mono, monospace">{info.gate ? '🔒 ' : ''}{t}</text>
                <text x={14} y={42} fontSize={10.5} fill={C.blush} fontFamily="Geist, sans-serif">{fmtN(info.rows)} rows · {info.columns} columns</text>
                <rect x={14} y={52} width={BW - 28} height={6} rx={3} fill="rgb(234 230 227 / 0.2)" />
                <rect x={14} y={52} width={(BW - 28) * sens} height={6} rx={3} fill={C.mustard} />
              </g>
            )
          })}
        </svg>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 font-label text-[9.5px] font-bold uppercase tracking-[0.08em] text-muted">
        <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded-[4px] bg-ink" />Table</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded-[4px] bg-oxblood" />Gated table (P4)</span>
        <span className="flex items-center gap-1.5"><span className="h-1.5 w-5 rounded-full bg-mustard" />Share of sensitive columns</span>
        <span>Edge label: join column · % of ids that exist on the other side</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ privacy scan */

export function PrivacyPanel({ ds, onChanged }: { ds: string; onChanged: () => void }) {
  const { data, error, reload } = useLoad<PiiScan>(() => api.pii(ds), [ds])
  const [pick, setPick] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => { if (data) setPick(data.findings.filter(f => f.under_labelled).map(f => f.resource)) }, [data])
  if (error) return <ErrorNote error={error} />
  if (!data) return <Loading text="Reading sample values to look for personal data…" />
  const apply = async () => {
    setBusy(true)
    try { const r = await api.piiApply(ds, pick); setMsg(`${r.changed.length} column(s) raised.`); reload(); onChanged() }
    catch (e) { setMsg((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        <Tile n={data.findings.length} l="Columns holding personal data" bg={C.ink} />
        <Tile n={data.under_labelled} l="Labelled too low" bg={data.under_labelled ? C.scarlet : '#2e7046'} />
        <Tile n={data.injections.reduce((a, b) => a + b.cells, 0)} l="Instruction-like cells found" bg={C.tangerine} />
      </div>
      <p className="text-[12.5px] text-muted">
        Column names can lie: a column called “contact” may hold e-mails. This scan reads a sample of the <b className="text-ink">values</b> (by code, never the AI) and
        shows only masked examples. Raising a label means the policy engine will treat that column more strictly from the next run.
      </p>
      <div className="overflow-x-auto rounded-[16px] border-[1.5px] border-line">
        <table className="w-full bg-surface">
          <thead><tr><th className="th w-8" /><th className="th">Column</th><th className="th">Looks like</th><th className="th">Match</th><th className="th">Example (masked)</th><th className="th">Label now → suggested</th></tr></thead>
          <tbody className="divide-y divide-line">
            {data.findings.map(f => (
              <tr key={f.resource} className={clsx(f.under_labelled && 'bg-bad-soft/40')}>
                <td className="td">{f.under_labelled && <input type="checkbox" checked={pick.includes(f.resource)}
                  onChange={e => setPick(e.target.checked ? [...pick, f.resource] : pick.filter(x => x !== f.resource))} />}</td>
                <td className="td font-mono text-[12px] text-ink">{f.resource}{f.free_text && <span className="ml-1 text-[10px] text-muted">(free text)</span>}</td>
                <td className="td text-[12.5px]">{f.detector}</td>
                <td className="td"><div className="flex items-center gap-2"><span className="h-1.5 w-16 overflow-hidden rounded-full bg-sunken"><span className="block h-full bg-oxblood" style={{ width: `${f.match_rate * 100}%` }} /></span><span className="font-mono text-[11px]">{pct(f.match_rate)}</span></div></td>
                <td className="td font-mono text-[12px]">{f.example}</td>
                <td className="td">
                  <span className="rounded-[5px] px-1.5 py-0.5 font-label text-[9.5px] font-bold uppercase" style={{ background: SENS[f.current], color: f.current === 'restricted' ? C.paper : C.ink }}>{f.current}</span>
                  {f.under_labelled && <> → <span className="rounded-[5px] px-1.5 py-0.5 font-label text-[9.5px] font-bold uppercase" style={{ background: SENS[f.suggested], color: f.suggested === 'restricted' ? C.paper : C.ink }}>{f.suggested}</span></>}
                </td>
              </tr>
            ))}
            {data.findings.length === 0 && <tr><td className="td text-muted" colSpan={6}>No personal data patterns found in the sampled values.</td></tr>}
          </tbody>
        </table>
      </div>
      {data.under_labelled > 0 && (
        <button onClick={apply} disabled={busy || !pick.length}
          className="flex h-11 items-center gap-2 rounded-[12px] bg-scarlet px-5 font-label text-[11.5px] font-bold uppercase tracking-[0.08em] text-paper shadow-[0_3px_0_var(--color-oxblood)] disabled:opacity-50">
          {busy ? 'Applying…' : `Raise ${pick.length} label(s)`}
        </button>
      )}
      {msg && <div className="text-[13px] text-good">{msg}</div>}
      {data.injections.length > 0 && (
        <div className="rounded-[14px] border-l-4 border-tangerine bg-warn-soft/60 px-4 py-3 text-[13px] text-fg-2">
          <b className="font-label text-[10px] uppercase tracking-[0.1em] text-ink">Prompt-injection risk</b><br />
          {data.injections.map(i => <span key={i.resource} className="mr-3"><span className="font-mono">{i.resource}</span>: {i.cells} instruction-like cell(s) in {i.scanned} scanned. </span>)}
          The <Term t="firewall">firewall</Term> masks these automatically before any AI reads a query result.
        </div>
      )}
    </div>
  )
}

function Tile({ n, l, bg }: { n: number; l: string; bg: string }) {
  return <div className="rounded-[16px] px-4 py-3.5 text-paper" style={{ background: bg }}>
    <div className="font-display text-[30px] leading-none"><CountUp value={n} /></div>
    <div className="mt-1.5 font-label text-[9.5px] font-bold uppercase tracking-[0.12em] opacity-85">{l}</div></div>
}

/* ------------------------------------------------------------------ ingest log */

export function IngestPanel({ ds }: { ds: string }) {
  const { data, error } = useLoad<IngestReport>(() => api.ingestReport(ds), [ds])
  if (error) return <ErrorNote error={error} />
  if (!data) return <Loading text="Loading the ingest log…" />
  if (!data.tables.length) return <div className="rounded-[16px] bg-sunken px-5 py-8 text-[13px] text-muted">{data.note ?? 'No ingest log.'} Upload files to see every cleaning step recorded here.</div>
  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-muted">Every change made to your files on the way in, so nothing happens silently. Loaded in {data.seconds}s.</p>
      {data.tables.map(t => (
        <div key={t.table} className="rounded-[16px] border-[1.5px] border-line bg-surface p-4">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-mono text-[14px] font-semibold text-ink">{t.table}</span>
            <span className="text-[12px] text-muted">from {t.source} · {(t.bytes / 1e6).toFixed(1)} MB · {fmtN(t.rows)} rows · {t.columns} columns</span>
          </div>
          <ol className="mt-3 space-y-1.5">
            {t.actions.map((a, i) => (
              <li key={i} className="flex gap-2 text-[12.5px] text-fg-2">
                <span className="font-display text-[12px] text-oxblood">{String(i + 1).padStart(2, '0')}</span>
                <span><b className="text-ink">{a.action}</b>{a.count != null && ` (${a.count})`}
                  {a.columns && a.columns.length > 0 && <span className="font-mono text-[11.5px]"> · {a.columns.join(', ')}</span>}
                  {a.pairs && <span className="font-mono text-[11.5px]"> · {a.pairs.slice(0, 4).map(p => `${p[0]} → ${p[1]}`).join(', ')}{a.pairs.length > 4 ? '…' : ''}</span>}</span>
              </li>
            ))}
            {t.indexed.length > 0 && <li className="flex gap-2 text-[12.5px] text-fg-2"><span className="font-display text-[12px] text-oxblood">✓</span><span><b className="text-ink">indexed for fast queries</b> · <span className="font-mono text-[11.5px]">{t.indexed.join(', ')}</span></span></li>}
          </ol>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ answer key */

export function AnswerPanel({ ds, onPick }: { ds: string; onPick: (problem: string) => void }) {
  const { data, error } = useLoad<AnswerKey>(() => api.answers(ds), [ds])
  const [shown, setShown] = useState<string[]>([])
  if (error) return <ErrorNote error={error} />
  if (!data) return <Loading text="Loading the answer key…" />
  return (
    <div className="space-y-4">
      <p className="text-[13px] leading-relaxed text-fg-2">
        Each incident below was planted in the data on purpose, so we know the right answer. Press <b>Investigate</b> to hand its question to the agent,
        then compare its report with the cause. Causes are hidden until you reveal them, so you can test yourself too.
      </p>
      <div className="grid gap-3 lg:grid-cols-2">
        {data.incidents.map((inc, i) => {
          const open = shown.includes(inc.id)
          return (
            <div key={inc.id} className="flex flex-col overflow-hidden rounded-[18px] border-[1.5px] border-line bg-surface">
              <div className="flex items-center gap-3 px-4 py-3 text-paper" style={{ background: [C.oxblood, C.scarlet, C.tangerine, C.ink][i % 4] }}>
                <span className="font-display text-[24px] leading-none">{inc.id}</span>
                <span className="font-label text-[10.5px] font-bold uppercase tracking-[0.08em]">{inc.month}</span>
                <span className={clsx('ml-auto rounded-full px-2 py-0.5 font-mono text-[11px]', inc.change < 0 ? 'bg-paper/20' : 'bg-mustard text-ink')}>{inc.change > 0 ? '+' : ''}{(inc.change * 100).toFixed(1)}%</span>
              </div>
              <div className="flex flex-1 flex-col p-4">
                <div className="font-label text-[9.5px] font-bold uppercase tracking-[0.1em] text-muted">the question</div>
                <p className="mt-1 text-[13px] leading-snug text-fg">{inc.problem}</p>
                <div className="relative mt-3 flex-1 rounded-[12px] bg-sunken p-3">
                  <div className={clsx('font-label text-[9.5px] font-bold uppercase tracking-[0.1em] text-oxblood', !open && 'select-none blur-[5px]')}>{inc.title}</div>
                  <p className={clsx('mt-1 text-[12.5px] leading-snug text-fg-2 transition', !open && 'select-none blur-[5px]')}>{inc.cause}</p>
                  {open && <p className="mt-2 text-[11.5px] text-muted"><b>Tell-tale sign:</b> {inc.signature}</p>}
                  {open && <p className="mt-1 font-mono text-[10.5px] text-muted">needs: {inc.required.join(', ')}</p>}
                  {!open && <button onClick={() => setShown([...shown, inc.id])} className="absolute inset-0 grid place-items-center font-label text-[11px] font-bold uppercase tracking-[0.1em] text-ink">Reveal the cause</button>}
                </div>
                <button onClick={() => onPick(inc.problem)}
                  className="group mt-3 flex h-10 items-center justify-center gap-2 rounded-[10px] bg-ink font-label text-[11px] font-bold uppercase tracking-[0.08em] text-paper hover:bg-oxblood">
                  Investigate {inc.id} <Arrow className="h-3.5 w-3.5 transition-transform group-hover:rotate-45" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
      {data.decoys.length > 0 && (
        <div className="rounded-[16px] bg-ink p-4 text-paper">
          <div className="font-label text-[10px] font-bold uppercase tracking-[0.12em] text-mustard">Traps planted to catch careless analysis</div>
          <ul className="mt-2 space-y-1 text-[13px] text-paper/85">{data.decoys.map(d => <li key={d}>· {d}</li>)}</ul>
        </div>
      )}
    </div>
  )
}

export const goInvestigate = () => go('investigate')
