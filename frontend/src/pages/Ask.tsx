import clsx from 'clsx'
import { ArrowUp, ChevronRight, KeyRound, MessageSquareText, ShieldX, Sparkles, Timer } from 'lucide-react'
import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api, type AskAnswer } from '../api'
import { Card, Chip, CodeBlock, Empty, ErrorNote } from '../components/ui'
import { useStore } from '../store'

const compact = (n: number) => Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(n)

export default function Ask() {
  const { dataset, mode, model, asks, addAsk } = useStore()
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const history = dataset ? asks[dataset.name] ?? [] : []

  const submit = async (question = q) => {
    if (!dataset || !question.trim()) return
    setBusy(true); setError(null)
    try { addAsk(await api.ask({ dataset: dataset.name, question, mode, model })); setQ('') }
    catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-extrabold tracking-tight text-white">Ask <span className="gradient-text">your data</span></h1>
        <p className="mt-2 text-sm text-slate-400">Plain English in, checked SQL out. Each answer gets a one-shot capability for exactly the columns its query uses.</p>
      </div>

      <div className="card p-2">
        <form onSubmit={e => { e.preventDefault(); submit() }} className="flex items-center gap-2">
          <MessageSquareText className="ml-3 h-5 w-5 shrink-0 text-indigo-300" />
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} disabled={busy}
            placeholder="e.g. Which 10 products earned the most last quarter?"
            className="h-12 flex-1 bg-transparent text-[15px] text-white placeholder:text-slate-500 outline-none" />
          <button type="submit" disabled={busy || !q.trim()}
            className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/30 transition hover:brightness-110 disabled:opacity-40">
            {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <ArrowUp className="h-5 w-5" />}
          </button>
        </form>
      </div>

      {dataset?.sample_questions && dataset.sample_questions.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2">
          {dataset.sample_questions.slice(0, 9).map(s => (
            <button key={s} onClick={() => { setQ(s); submit(s) }} disabled={busy}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-xs text-slate-300 transition hover:border-indigo-400/40 hover:bg-indigo-500/10 hover:text-white disabled:opacity-50">
              {s}
            </button>
          ))}
        </div>
      )}

      {error && <ErrorNote error={error} />}
      {busy && <div className="card h-40 animate-pulse" />}
      {history.length === 0 && !busy
        ? <Empty icon={<Sparkles className="h-5 w-5" />} title="Ask anything about this dataset"
            text="Totals, rankings, trends, comparisons. Confidential columns are only ever counted, never listed." />
        : history.map((a, i) => <AnswerCard key={`${a.question}-${i}`} a={a} />)}
    </div>
  )
}

function AnswerCard({ a }: { a: AskAnswer }) {
  const [showSql, setShowSql] = useState(false)
  const [showTry, setShowTry] = useState(false)
  const chartable = a.chart !== 'none' && a.columns.includes(a.x) && a.columns.includes(a.y) && a.rows.length > 1
  const data = chartable ? a.rows.slice(0, 60).map(r => ({ x: String(r[a.x]), y: Number(r[a.y]) })) : []
  return (
    <Card className="overflow-hidden animate-fade-in">
      <div className="border-b border-white/[0.06] px-5 py-4">
        <div className="text-[15px] font-semibold text-white">{a.question}</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1"><Timer className="h-3 w-3" />{a.seconds}s</span>
          <span className="flex items-center gap-1"><KeyRound className="h-3 w-3" />
            {Object.entries(a.granted).map(([c, m]) => <Chip key={c} mono tone={m === 'aggregate_only' ? 'warn' : 'default'}>{c.split('.').pop()}{m === 'aggregate_only' ? ' · count-only' : ''}</Chip>)}
          </span>
          <span>revoked after answering</span>
        </div>
      </div>
      <div className="p-5">
        <div className={clsx('rounded-xl px-4 py-3.5 text-[15px] leading-relaxed',
          a.denied ? 'bg-rose-500/10 text-rose-100 ring-1 ring-rose-500/25' : 'bg-sky-500/[0.07] text-slate-100 ring-1 ring-sky-400/15')}>
          {a.denied && <ShieldX className="mb-1 h-4 w-4 text-rose-300" />}{a.answer}
        </div>

        {chartable && (
          <div className="mt-5 h-64">
            <ResponsiveContainer>
              {a.chart === 'line' ? (
                <LineChart data={data} margin={{ left: -6, right: 8, top: 8 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="x" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
                  <YAxis tickFormatter={compact} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={v => compact(Number(v))} contentStyle={{ background: '#0b1020', border: '1px solid rgba(255,255,255,.1)', borderRadius: 12, fontSize: 12 }} />
                  <Line type="monotone" dataKey="y" name={a.y} stroke="#818cf8" strokeWidth={2.5} dot={false} />
                </LineChart>
              ) : (
                <BarChart data={data} margin={{ left: -6, right: 8, top: 8 }}>
                  <defs><linearGradient id="bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#818cf8" /><stop offset="1" stopColor="#22d3ee" stopOpacity={0.7} /></linearGradient></defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="x" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} interval={0} angle={data.length > 8 ? -25 : 0} textAnchor={data.length > 8 ? 'end' : 'middle'} height={data.length > 8 ? 70 : 30} tickFormatter={v => String(v).slice(0, 20)} />
                  <YAxis tickFormatter={compact} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={v => compact(Number(v))} contentStyle={{ background: '#0b1020', border: '1px solid rgba(255,255,255,.1)', borderRadius: 12, fontSize: 12 }} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                  <Bar dataKey="y" name={a.y} fill="url(#bar)" radius={[6, 6, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}

        {a.rows.length > 0 && (
          <div className="mt-5 max-h-72 overflow-auto rounded-xl border border-white/[0.06]">
            <table className="w-full">
              <thead className="sticky top-0 bg-ink-850"><tr>{a.columns.map(c => <th key={c} className="th">{c}</th>)}</tr></thead>
              <tbody className="divide-y divide-white/[0.04]">
                {a.rows.slice(0, 100).map((r, i) => (
                  <tr key={i} className="hover:bg-white/[0.02]">
                    {a.columns.map(c => <td key={c} className="td whitespace-nowrap font-mono text-xs">
                      {typeof r[c] === 'number' ? r[c].toLocaleString('en-IN', { maximumFractionDigits: 2 }) : String(r[c] ?? '')}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            {a.total_rows > 100 && <div className="px-3 py-2 text-[11px] text-slate-500">Showing 100 of {a.total_rows.toLocaleString()} rows</div>}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-4">
          {a.sql && <button onClick={() => setShowSql(o => !o)} className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-white">
            <ChevronRight className={clsx('h-3.5 w-3.5 transition', showSql && 'rotate-90')} /> Generated SQL</button>}
          {a.attempts.length > 1 && <button onClick={() => setShowTry(o => !o)} className="flex items-center gap-1 text-xs font-medium text-amber-300/90 hover:text-amber-200">
            <ChevronRight className={clsx('h-3.5 w-3.5 transition', showTry && 'rotate-90')} /> {a.attempts.length - 1} attempt(s) blocked by policy/gateway</button>}
        </div>
        {showSql && <div className="mt-3"><CodeBlock code={a.sql} /></div>}
        {showTry && <div className="mt-3 space-y-2">{a.attempts.map(t => (
          <div key={t.attempt} className="rounded-xl border border-white/[0.06] p-3">
            <div className={clsx('mb-2 text-xs font-semibold', t.result.startsWith('ok') ? 'text-emerald-300' : 'text-rose-300')}>#{t.attempt} · {t.result}</div>
            <CodeBlock code={t.sql} />
          </div>))}</div>}
      </div>
    </Card>
  )
}
