import clsx from 'clsx'
import { ChevronRight, FileSearch, Fingerprint, Info, ScrollText, ShieldCheck, TriangleAlert } from 'lucide-react'
import { BotMark as Bot, C, Mascot, Sticker } from '../components/brand'
import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { EvidenceNode, Investigation } from '../api'
import { PrivilegeChart, ReceiptCard } from '../components/Insight'
import { CHART, Card, Chip, CodeBlock, SectionTitle, Stat, StatusBadge, pct } from '../components/ui'

const compact = (n: number) => Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(n)

export default function ReportView({ inv }: { inv: Investigation }) {
  const res = inv.result!
  const rep = res.report
  if (rep.not_investigation) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-warn/25 bg-warn-soft p-5">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
        <div className="text-sm leading-relaxed text-fg-2">{rep.plain_summary}</div>
      </div>
    )
  }
  const e = rep.exposure
  const direct = !!rep.unverified
  return (
    <div className="space-y-8 animate-fade-in">
      {/* plain words */}
      <section className={clsx('relative overflow-hidden rounded-[26px] px-6 pb-8 pt-8 sm:px-9', direct ? 'bg-tangerine text-paper' : 'bg-good text-paper')}>
        <Mascot size={150} mood={direct ? 'wow' : 'cool'} head={C.paper} className="absolute -right-6 -top-4 hidden rotate-[12deg] md:block" />
        <Sticker r={-4} className={direct ? 'bg-ink text-paper' : 'bg-mustard text-ink'}>{direct ? "The AI's own conclusion · unchecked" : 'The answer · checked by code'}</Sticker>
        <div className="display mt-5 max-w-4xl text-[clamp(26px,3.4vw,46px)]">{rep.root_cause}</div>
        <p className="mt-4 max-w-3xl text-[16.5px] leading-relaxed text-paper/90">{rep.plain_summary}</p>
        {rep.key_facts.length > 0 && (
          <ul className="mt-6 grid gap-2 md:grid-cols-2">
            {rep.key_facts.map((f, i) => (
              <li key={f} className="flex animate-fade-in gap-3 rounded-[12px] bg-paper/12 px-4 py-3 text-[13.5px] leading-relaxed" style={{ animationDelay: `${i * 90}ms` }}>
                <span className="font-display text-[15px] text-mustard">{String(i + 1).padStart(2, '0')}</span>{f}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-5 flex items-start gap-1.5 text-[12px] text-paper/80">
          {direct ? <><TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" /> Written by the AI from its own reading. No number, claim or verdict here was checked by code.</>
            : <>Numbers are calculated from the data by code, not written by the AI. {rep.caveat}</>}
        </p>
      </section>

      {res.answer_check && (
        <section className={clsx('flex flex-wrap items-start gap-4 rounded-[20px] border-2 p-5', res.answer_check.found ? 'border-good bg-good-soft' : 'border-scarlet bg-bad-soft')}>
          <span className={clsx('grid h-12 w-12 shrink-0 place-items-center rounded-full font-display text-[22px] text-paper', res.answer_check.found ? 'bg-good' : 'bg-scarlet')}>
            {res.answer_check.found ? '✓' : '✗'}</span>
          <div className="min-w-0 flex-1">
            <div className="font-label text-[10px] font-bold uppercase tracking-[0.12em] text-ink">Answer key · {res.answer_check.incident} · {res.answer_check.title}</div>
            <div className="display mt-1 text-[22px] text-ink">{res.answer_check.found ? 'The agent found the planted cause' : 'The agent missed the planted cause'}</div>
            <p className="mt-1 text-[13px] leading-relaxed text-fg-2"><b>What was planted:</b> {res.answer_check.cause}</p>
            {!res.answer_check.found && <p className="mt-1 text-[12px] text-scarlet">Not mentioned in the report: {res.answer_check.missing.join(', ')}</p>}
          </div>
        </section>
      )}

      {/* metrics */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Columns touched" value={`${e.columns_touched.length}/${e.columns_total}`} hint="distinct columns read" />
        <Stat label="Data exposure" value={pct(e.data_exposure_ratio)} hint="lower is better" tone={e.data_exposure_ratio < 0.3 ? 'good' : 'neutral'} />
        <Stat label="Sensitive raw" value={e.sensitive_exposed_raw.length} tone={e.sensitive_exposed_raw.length ? 'bad' : 'good'} hint="unmasked sensitive cols" />
        <Stat label="Queries" value={`${e.queries_allowed} / ${e.queries_denied}`} hint="allowed / denied" />
        <Stat label="Capabilities" value={e.capabilities_issued} hint={`gateway p50 ${e.gateway_p50_ms ?? '–'} ms`} />
        <Stat label="Time" value={`${inv.seconds ?? '–'}s`} hint={direct ? 'Direct AI run' : 'InvestiGuard run'} />
      </div>
      {!direct && e.overhead_p50_ms != null && (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[18px] border-[1.5px] border-line bg-line md:grid-cols-4">
          <Stat label="Security overhead p50" value={`${e.overhead_p50_ms} ms`} hint={`p95 ${e.overhead_p95_ms ?? '–'} ms · target ≤ 50 / 150`} tone={(e.overhead_p50_ms ?? 0) <= 50 ? 'good' : 'neutral'} />
          <Stat label="Overhead share" value={inv.seconds ? pct((e.overhead_total_ms ?? 0) / 1000 / inv.seconds, 2) : '–'} hint="of total time · target < 10%" tone="good" />
          <Stat label="Policy decisions" value={e.policy_decisions ?? 0} hint={`p50 ${e.policy_p50_ms ?? '–'} ms`} />
          <Stat label="Evidence faithfulness" value={pct(rep.evidence_faithfulness ?? 1)} hint={`${rep.claims.length} of ${rep.claims_proposed ?? rep.claims.length} claims cite evidence`} tone="good" />
        </div>
      )}

      {/* privilege over time */}
      {res.privilege && res.privilege.curve.length > 2 && (
        <section>
          <SectionTitle icon={<ShieldCheck className="h-4 w-4" />} title="Privilege over time"
            sub="how many columns were open to the agent at each moment of the run" />
          <Card className="grid gap-6 p-5 lg:grid-cols-[1fr_260px]">
            <PrivilegeChart series={[{ name: direct ? 'Direct AI' : 'InvestiGuard', privilege: res.privilege, color: direct ? '#F45016' : '#8B231A' }]} />
            <dl className="grid content-center gap-4">
              <div><dt className="eyebrow">Standing privilege</dt>
                <dd className="mt-1 text-[22px] font-semibold tabular-nums text-fg">{res.privilege.column_seconds.toFixed(0)} <span className="text-sm font-normal text-muted">column·seconds</span></dd>
                <dd className="text-xs text-subtle">columns open × time they stayed open</dd></div>
              <div><dt className="eyebrow">Peak</dt>
                <dd className="mt-1 text-[22px] font-semibold tabular-nums text-fg">{res.privilege.peak_columns} <span className="text-sm font-normal text-muted">of {e.columns_total} columns</span></dd></div>
              {!direct && <div><dt className="eyebrow">Injection firewall</dt>
                <dd className={clsx('mt-1 text-[22px] font-semibold tabular-nums', e.injections_blocked ? 'text-bad' : 'text-fg')}>{e.injections_blocked ?? 0} <span className="text-sm font-normal text-muted">cells masked</span></dd></div>}
            </dl>
          </Card>
        </section>
      )}

      {/* technical report */}
      <section>
        <SectionTitle icon={<ScrollText className="h-4 w-4" />} title="Technical report" sub={rep.done_reason ?? undefined} />
        <Card className="p-6">
          <div className="eyebrow">Root cause</div>
          <p className="mt-1.5 text-[15px] font-medium leading-relaxed text-fg">{rep.root_cause}</p>
          <p className="mt-4 border-t border-line pt-4 text-sm leading-relaxed text-fg-2">{rep.summary}</p>
          <ul className="mt-3 space-y-2">
            {rep.claims.map(c => (
              <li key={c.text} className="flex gap-2.5 text-sm leading-relaxed text-fg-2">
                <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-subtle" />
                <span>{c.text} {c.evidence_ids.map(id => <Chip key={id} tone="accent">{id}</Chip>)}</span>
              </li>
            ))}
          </ul>
          {rep.unsupported_claims_dropped > 0 &&
            <p className="mt-3 text-xs text-warn">{rep.unsupported_claims_dropped} claim(s) without evidence were removed automatically.</p>}
          {rep.limitations && <p className="mt-3 text-xs text-muted">Limitations: {rep.limitations}</p>}
        </Card>
      </section>

      {/* direct AI: the queries it chose, with nothing computed on top */}
      {direct && res.steps && (
        <section>
          <SectionTitle icon={<Bot className="h-4 w-4" />} title="Queries the AI ran" sub="no hypotheses and no evidence engine: the AI judged these results itself" />
          <Card className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-line"><tr><th className="th">Step</th><th className="th">Why</th><th className="th">Columns read</th><th className="th text-right">Rows</th></tr></thead>
              <tbody className="divide-y divide-line">
                {res.steps.map(s => (
                  <tr key={s.id} className="hover:bg-canvas">
                    <td className="td font-mono text-xs">{s.id}</td>
                    <td className="td text-[13px]">{s.thought}{s.error && <div className="mt-0.5 text-xs text-bad">{s.error}</div>}</td>
                    <td className="td"><span className="flex flex-wrap gap-1">{(s.columns ?? []).map(c => <Chip key={c} mono>{c.split('.').pop()}</Chip>)}</span></td>
                    <td className="td text-right font-mono text-xs">{s.rows}</td>
                  </tr>))}
              </tbody>
            </table>
          </Card>
        </section>
      )}

      {/* evidence */}
      {!direct && <section>
        <SectionTitle icon={<Fingerprint className="h-4 w-4" />} title="Evidence provenance"
          sub="hypothesis → capability → query → verdict computed by the evidence engine" />
        <div className="grid gap-3 lg:grid-cols-2">
          {res.evidence.map(ev => <EvidenceCard key={ev.id} ev={ev} statement={res.hypotheses[ev.hypothesis]?.statement} />)}
        </div>
      </section>}

      {/* audit */}
      <section>
        <SectionTitle icon={<ShieldCheck className="h-4 w-4" />} title="Gateway audit log" sub="every query the agent attempted" />
        <Card className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-line"><tr>
              <th className="th">Hyp.</th><th className="th">Verdict</th><th className="th">Columns / reason</th><th className="th text-right">Rows</th><th className="th text-right">Check</th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {res.gateway_log.map((q, i) => (
                <tr key={i} className="hover:bg-canvas">
                  <td className="td font-mono text-xs">{q.hypothesis_id}</td>
                  <td className="td"><span className={clsx('rounded px-1.5 py-0.5 text-[11px] font-medium',
                    q.verdict === 'allowed' ? 'bg-good-soft text-good' : q.verdict === 'denied' ? 'bg-bad-soft text-bad' : 'bg-warn-soft text-warn')}>{q.verdict}</span></td>
                  <td className="td text-xs">{q.verdict === 'allowed'
                    ? <span className="flex flex-wrap gap-1">{q.columns_used.map(c => <Chip key={c} mono>{c.split('.').pop()}</Chip>)}</span>
                    : <span className="text-muted">{q.reason}</span>}</td>
                  <td className="td text-right font-mono text-xs">{q.rows}</td>
                  <td className="td text-right font-mono text-xs">{q.latency_ms.toFixed(1)} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      {res.receipt && <ReceiptCard runId={inv.id} receipt={res.receipt} />}
    </div>
  )
}

function EvidenceCard({ ev, statement }: { ev: EvidenceNode; statement?: string }) {
  const [sql, setSql] = useState(false)
  const s = ev.stats
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-medium text-fg">{ev.id}</span>
          <span className="font-mono text-xs text-subtle">{ev.hypothesis}</span>
          <StatusBadge status={ev.verdict} />
        </div>
        {s && (s.kind ?? 'decomposition') === 'decomposition' && <div className="text-xs text-muted">
          share <b className="font-semibold tabular-nums text-fg">{pct(s.explained_share)}</b>{s.lift != null && <> · lift <b className="font-semibold tabular-nums text-fg">{s.lift}×</b></>}
          {s.significance_z != null && <> · z <b className="font-semibold tabular-nums text-fg">{s.significance_z}</b></>}
          {!!s.confidence && <> · confidence <b className="font-semibold tabular-nums text-fg">{pct(s.confidence)}</b></>}</div>}
        {s?.kind === 'price_volume' && <Chip>price vs volume</Chip>}
        {s?.kind === 'timeline' && <Chip>timing</Chip>}
      </div>
      {statement && <p className="mt-2.5 text-[13.5px] font-medium text-fg">{statement}</p>}
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{ev.finding}</p>
      {s?.kind === 'price_volume' && (
        <div className="mt-4 space-y-2">
          {([['Quantity effect', s.volume_share!, s.qty_change_pct!], ['Price effect', s.price_share!, s.price_change_pct!]] as const).map(([name, share, change]) => (
            <div key={name} className="flex items-center gap-3">
              <span className="w-28 text-xs text-fg-2">{name}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-sm bg-sunken">
                <div className="h-full rounded-sm bg-accent" style={{ width: `${Math.min(100, Math.max(0, share * 100))}%` }} />
              </div>
              <span className="w-32 text-right font-mono text-xs tabular-nums text-fg-2">{pct(share)} · {change > 0 ? '+' : ''}{pct(change)}</span>
            </div>))}
          <p className="text-[11.5px] text-subtle">Share of this segment's change, and how much quantity and price per unit moved.</p>
        </div>
      )}
      {s?.kind === 'timeline' && s.series && (
        <div className="mt-4 h-44">
          <ResponsiveContainer>
            <LineChart data={s.series} margin={{ left: -10, right: 8, top: 6, bottom: 0 }}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="period" tick={{ ...CHART.axis, fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={16} />
              <YAxis tickFormatter={compact} tick={{ ...CHART.axis, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => compact(Number(v))} contentStyle={CHART.tooltip} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#776C63' }} iconType="plainline" iconSize={12} />
              <ReferenceLine x={s.onset_period} stroke="#D32929" strokeDasharray="4 3" label={{ value: 'onset', fontSize: 10, fill: '#D32929', position: 'insideTopRight' }} />
              <Line type="monotone" dataKey="rest" name="Everything else" stroke={CHART.baseline} strokeWidth={1.6} dot={false} />
              <Line type="monotone" dataKey="segment" name={s.top_segment} stroke={CHART.series} strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {s && (s.kind ?? 'decomposition') === 'decomposition' && s.top_movers.length > 0 && (
        <div className="mt-4 h-44">
          <ResponsiveContainer>
            <BarChart data={s.top_movers.map(m => ({ ...m, segment: m.segment.length > 18 ? m.segment.slice(0, 17) + '…' : m.segment }))} margin={{ left: -10, right: 4, top: 4, bottom: 0 }} barGap={2}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="segment" tick={{ ...CHART.axis, fontSize: 10 }} axisLine={false} tickLine={false} interval={0} />
              <YAxis tickFormatter={compact} tick={{ ...CHART.axis, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => compact(Number(v))} contentStyle={CHART.tooltip} cursor={CHART.cursor} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#776C63' }} iconType="square" iconSize={8} />
              <Bar dataKey="baseline" name="Baseline" fill={CHART.baseline} radius={[2, 2, 0, 0]} />
              <Bar dataKey="incident" name="Incident" fill={CHART.series} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {s?.reason && <p className="mt-2 flex items-start gap-1.5 text-[11.5px] text-subtle"><FileSearch className="mt-0.5 h-3.5 w-3.5 shrink-0" />{s.reason}</p>}
      <button onClick={() => setSql(o => !o)} className="mt-3 flex items-center gap-1 text-[11.5px] text-subtle hover:text-fg">
        <ChevronRight className={clsx('h-3 w-3 transition', sql && 'rotate-90')} /> SQL · {ev.rows} rows · {ev.columns.length} columns
      </button>
      {sql && <div className="mt-2"><CodeBlock code={ev.sql} /></div>}
    </Card>
  )
}
