import clsx from 'clsx'
import { Bot, ChevronRight, FileSearch, Fingerprint, Info, ScrollText, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { EvidenceNode, Investigation } from '../api'
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
      <section className="card overflow-hidden">
        <div className={clsx('border-l-[3px] px-7 py-6', direct ? 'border-warn' : 'border-accent')}>
          <div className={clsx('eyebrow', direct ? 'text-warn' : 'text-accent')}>{direct ? "The AI's own conclusion" : 'Conclusion in plain words'}</div>
          <p className="mt-3 max-w-4xl text-[19px] font-medium leading-relaxed tracking-[-0.01em] text-fg">{rep.plain_summary}</p>
          {rep.key_facts.length > 0 && (
            <ul className="mt-5 grid gap-x-8 gap-y-2 md:grid-cols-2">
              {rep.key_facts.map(f => (
                <li key={f} className="flex gap-2.5 text-[13.5px] leading-relaxed text-fg-2">
                  <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-fg-2" />{f}
                </li>
              ))}
            </ul>
          )}
          {direct
            ? <p className="mt-5 flex items-start gap-1.5 text-[11.5px] text-warn"><TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
                Written by the AI from its own reading of the results. No number, claim or verdict here was checked by code.</p>
            : <p className="mt-5 text-[11.5px] text-subtle">Key numbers are calculated directly from the data by code, not written by the AI.</p>}
        </div>
      </section>

      {/* metrics */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Columns touched" value={`${e.columns_touched.length}/${e.columns_total}`} hint="distinct columns read" />
        <Stat label="Data exposure" value={pct(e.data_exposure_ratio)} hint="lower is better" tone={e.data_exposure_ratio < 0.3 ? 'good' : 'neutral'} />
        <Stat label="Sensitive raw" value={e.sensitive_exposed_raw.length} tone={e.sensitive_exposed_raw.length ? 'bad' : 'good'} hint="unmasked sensitive cols" />
        <Stat label="Queries" value={`${e.queries_allowed} / ${e.queries_denied}`} hint="allowed / denied" />
        <Stat label="Capabilities" value={e.capabilities_issued} hint={`gateway p50 ${e.gateway_p50_ms ?? '–'} ms`} />
        <Stat label="Time" value={`${inv.seconds ?? '–'}s`} hint={direct ? 'Direct AI run' : 'InvestiGuard run'} />
      </div>

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
        {s && <div className="text-xs text-muted">
          share <b className="font-semibold tabular-nums text-fg">{pct(s.explained_share)}</b>{s.lift != null && <> · lift <b className="font-semibold tabular-nums text-fg">{s.lift}×</b></>}</div>}
      </div>
      {statement && <p className="mt-2.5 text-[13.5px] font-medium text-fg">{statement}</p>}
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{ev.finding}</p>
      {s && s.top_movers.length > 0 && (
        <div className="mt-4 h-44">
          <ResponsiveContainer>
            <BarChart data={s.top_movers.map(m => ({ ...m, segment: m.segment.length > 18 ? m.segment.slice(0, 17) + '…' : m.segment }))} margin={{ left: -10, right: 4, top: 4, bottom: 0 }} barGap={2}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="segment" tick={{ ...CHART.axis, fontSize: 10 }} axisLine={false} tickLine={false} interval={0} />
              <YAxis tickFormatter={compact} tick={{ ...CHART.axis, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => compact(Number(v))} contentStyle={CHART.tooltip} cursor={CHART.cursor} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#6b6862' }} iconType="square" iconSize={8} />
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
