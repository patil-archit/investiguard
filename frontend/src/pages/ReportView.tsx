import clsx from 'clsx'
import { ChevronRight, FileSearch, Fingerprint, Gauge, Info, MessageCircleHeart, ScrollText, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { EvidenceNode, Investigation } from '../api'
import { Card, Chip, CodeBlock, SectionTitle, Stat, StatusBadge, pct } from '../components/ui'

const compact = (n: number) => Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(n)

export default function ReportView({ inv }: { inv: Investigation }) {
  const res = inv.result!
  const rep = res.report
  if (rep.not_investigation) {
    return (
      <Card className="flex items-start gap-3 border-amber-500/25 p-5">
        <Info className="mt-0.5 h-5 w-5 text-amber-300" />
        <div className="text-sm text-amber-100">{rep.plain_summary}</div>
      </Card>
    )
  }
  const e = rep.exposure
  return (
    <div className="space-y-6 animate-fade-in">
      {/* plain words */}
      <div className="relative overflow-hidden rounded-2xl border border-emerald-400/25 bg-gradient-to-br from-emerald-500/[0.12] via-emerald-500/[0.04] to-transparent p-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-300">
          <MessageCircleHeart className="h-4 w-4" /> In plain words
        </div>
        <p className="max-w-4xl text-lg font-medium leading-relaxed text-white">{rep.plain_summary}</p>
        {rep.key_facts.length > 0 && (
          <div className="mt-5 grid gap-2 md:grid-cols-2">
            {rep.key_facts.map(f => (
              <div key={f} className="flex gap-2.5 rounded-xl bg-black/20 px-3.5 py-2.5 text-[13px] leading-relaxed text-emerald-50/90 ring-1 ring-white/5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />{f}
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-[11px] text-emerald-200/60">Key numbers are calculated directly from the data by code, not written by the AI.</p>
      </div>

      {/* metrics */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Columns touched" value={`${e.columns_touched.length}/${e.columns_total}`} hint="distinct columns read" />
        <Stat label="Data exposure" value={pct(e.data_exposure_ratio)} hint="lower is better" tone={e.data_exposure_ratio < 0.3 ? 'good' : 'neutral'} />
        <Stat label="Sensitive raw" value={e.sensitive_exposed_raw.length} tone={e.sensitive_exposed_raw.length ? 'bad' : 'good'} hint="unmasked sensitive cols" />
        <Stat label="Queries" value={`${e.queries_allowed} / ${e.queries_denied}`} hint="allowed / denied" />
        <Stat label="Capabilities" value={e.capabilities_issued} hint={`gateway p50 ${e.gateway_p50_ms ?? '–'} ms`} />
        <Stat label="Time" value={`${inv.seconds ?? '–'}s`} hint={inv.mode === 'C' ? 'scoped run' : 'unrestricted run'} />
      </div>

      {/* technical report */}
      <Card className="p-6">
        <SectionTitle icon={<ScrollText className="h-4 w-4" />} title="Technical report" sub={rep.done_reason ?? undefined} />
        <div className="rounded-xl border border-indigo-400/20 bg-indigo-500/[0.07] px-4 py-3 text-[15px] text-slate-100">
          <span className="mr-2 text-xs font-bold uppercase tracking-wider text-indigo-300">Root cause</span>{rep.root_cause}
        </div>
        <p className="mt-4 text-sm leading-relaxed text-slate-300">{rep.summary}</p>
        <ul className="mt-3 space-y-2">
          {rep.claims.map(c => (
            <li key={c.text} className="flex gap-2.5 text-sm text-slate-300">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-500" />
              <span>{c.text} {c.evidence_ids.map(id => <Chip key={id} tone="accent">{id}</Chip>)}</span>
            </li>
          ))}
        </ul>
        {rep.unsupported_claims_dropped > 0 &&
          <p className="mt-3 text-xs text-amber-300/80">{rep.unsupported_claims_dropped} claim(s) without evidence were removed automatically.</p>}
        {rep.limitations && <p className="mt-3 text-xs text-slate-500">Limitations: {rep.limitations}</p>}
      </Card>

      {/* evidence */}
      <div>
        <SectionTitle icon={<Fingerprint className="h-4 w-4" />} title="Evidence provenance"
          sub="hypothesis → capability → query → verdict computed by the evidence engine" />
        <div className="grid gap-3 lg:grid-cols-2">
          {res.evidence.map(ev => <EvidenceCard key={ev.id} ev={ev} statement={res.hypotheses[ev.hypothesis]?.statement} />)}
        </div>
      </div>

      {/* audit */}
      <Card className="p-5">
        <SectionTitle icon={<ShieldCheck className="h-4 w-4" />} title="Gateway audit log" sub="every query the agent attempted" />
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-white/[0.06]"><tr>
              <th className="th">Hyp.</th><th className="th">Verdict</th><th className="th">Columns / reason</th><th className="th text-right">Rows</th><th className="th text-right">Check</th>
            </tr></thead>
            <tbody className="divide-y divide-white/[0.04]">
              {res.gateway_log.map((q, i) => (
                <tr key={i} className="hover:bg-white/[0.02]">
                  <td className="td font-mono text-xs">{q.hypothesis_id}</td>
                  <td className="td"><span className={clsx('rounded-md px-2 py-0.5 text-[11px] font-semibold',
                    q.verdict === 'allowed' ? 'bg-emerald-500/15 text-emerald-300' : q.verdict === 'denied' ? 'bg-rose-500/15 text-rose-300' : 'bg-amber-500/15 text-amber-300')}>{q.verdict}</span></td>
                  <td className="td text-xs">{q.verdict === 'allowed'
                    ? <span className="flex flex-wrap gap-1">{q.columns_used.map(c => <Chip key={c} mono>{c.split('.').pop()}</Chip>)}</span>
                    : <span className="text-slate-400">{q.reason}</span>}</td>
                  <td className="td text-right font-mono text-xs">{q.rows}</td>
                  <td className="td text-right font-mono text-xs">{q.latency_ms.toFixed(1)} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

function EvidenceCard({ ev, statement }: { ev: EvidenceNode; statement?: string }) {
  const [sql, setSql] = useState(false)
  const s = ev.stats
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Chip tone="accent">{ev.id}</Chip><span className="font-mono text-xs text-slate-500">{ev.hypothesis}</span>
          <StatusBadge status={ev.verdict} />
        </div>
        {s && <div className="flex items-center gap-1.5 text-xs text-slate-400"><Gauge className="h-3.5 w-3.5" />
          share <b className="text-slate-200">{pct(s.explained_share)}</b>{s.lift != null && <> · lift <b className="text-slate-200">{s.lift}×</b></>}</div>}
      </div>
      {statement && <p className="mt-2 text-[13px] font-medium text-slate-200">{statement}</p>}
      <p className="mt-1 text-[12.5px] leading-relaxed text-slate-400">{ev.finding}</p>
      {s && s.top_movers.length > 0 && (
        <div className="mt-3 h-44">
          <ResponsiveContainer>
            <BarChart data={s.top_movers.map(m => ({ ...m, segment: m.segment.length > 18 ? m.segment.slice(0, 17) + '…' : m.segment }))} margin={{ left: -10, right: 4, top: 4, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="segment" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} interval={0} />
              <YAxis tickFormatter={compact} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => compact(Number(v))} contentStyle={{ background: '#0b1020', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 12 }} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} iconType="circle" iconSize={7} />
              <Bar dataKey="baseline" name="baseline" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="incident" name="incident" fill="#22d3ee" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {s?.reason && <p className="mt-2 flex items-start gap-1.5 text-[11.5px] text-slate-500"><FileSearch className="mt-0.5 h-3.5 w-3.5 shrink-0" />{s.reason}</p>}
      <button onClick={() => setSql(o => !o)} className="mt-2 flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-300">
        <ChevronRight className={clsx('h-3 w-3 transition', sql && 'rotate-90')} /> SQL · {ev.rows} rows · {ev.columns.length} columns
      </button>
      {sql && <div className="mt-2"><CodeBlock code={ev.sql} /></div>}
    </Card>
  )
}
