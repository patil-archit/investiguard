import clsx from 'clsx'
import { ArrowUp, ChevronRight, KeyRound, MessageSquareText, ShieldX, Timer } from 'lucide-react'
import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api, type AskAnswer } from '../api'
import { CHART, Card, Chip, CodeBlock, Empty, ErrorNote, PageHeader } from '../components/ui'
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
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Ask your data"
        sub="Plain English in, checked SQL out. Each answer gets a one-shot capability for exactly the columns its query uses." />

      <form onSubmit={e => { e.preventDefault(); submit() }}
        className="card flex items-center gap-2 p-1.5 pl-4 transition focus-within:border-accent focus-within:shadow-[0_0_0_3px_rgb(17_96_122/0.12)]">
        <MessageSquareText className="h-4 w-4 shrink-0 text-subtle" />
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} disabled={busy}
          placeholder="e.g. Which 10 products earned the most last quarter?"
          className="h-10 flex-1 bg-transparent text-[14.5px] text-fg placeholder:text-subtle outline-none" />
        <button type="submit" disabled={busy || !q.trim()} aria-label="Ask"
          className="grid h-9 w-9 place-items-center rounded-md bg-fg text-canvas transition hover:bg-fg-2 disabled:opacity-30">
          {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-canvas/30 border-t-canvas" /> : <ArrowUp className="h-4 w-4" />}
        </button>
      </form>

      {dataset?.sample_questions && dataset.sample_questions.length > 0 && (
        <div>
          <div className="label">Try asking</div>
          <div className="flex flex-wrap gap-1.5">
            {dataset.sample_questions.slice(0, 9).map(s => (
              <button key={s} onClick={() => { setQ(s); submit(s) }} disabled={busy}
                className="rounded-md border border-line bg-surface px-3 py-1.5 text-left text-xs text-fg-2 transition hover:border-line-strong hover:text-fg disabled:opacity-50">
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <ErrorNote error={error} />}
      {busy && <div className="card h-40 animate-pulse" />}
      {history.length === 0 && !busy
        ? <Empty icon={<MessageSquareText className="h-6 w-6" />} title="Ask anything about this dataset"
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
      <div className="border-b border-line px-5 py-4">
        <div className="text-[15px] font-semibold text-fg">{a.question}</div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11.5px] text-subtle">
          <span className="flex items-center gap-1"><Timer className="h-3 w-3" />{a.seconds}s</span>
          <span className="flex flex-wrap items-center gap-1"><KeyRound className="h-3 w-3" />
            {Object.entries(a.granted).map(([c, m]) => <Chip key={c} mono tone={m === 'aggregate_only' ? 'warn' : 'default'}>{c.split('.').pop()}{m === 'aggregate_only' ? ' · count-only' : ''}</Chip>)}
          </span>
          <span>revoked after answering</span>
        </div>
      </div>
      <div className="p-5">
        <div className={clsx('text-[15px] leading-relaxed',
          a.denied ? 'flex gap-2 rounded-md border border-bad/25 bg-bad-soft px-4 py-3 text-bad' : 'text-fg')}>
          {a.denied && <ShieldX className="mt-1 h-4 w-4 shrink-0" />}{a.answer}
        </div>

        {chartable && (
          <div className="mt-6 h-64">
            <ResponsiveContainer>
              {a.chart === 'line' ? (
                <LineChart data={data} margin={{ left: -6, right: 8, top: 8 }}>
                  <CartesianGrid stroke={CHART.grid} vertical={false} />
                  <XAxis dataKey="x" tick={CHART.axis} axisLine={false} tickLine={false} minTickGap={24} />
                  <YAxis tickFormatter={compact} tick={CHART.axis} axisLine={false} tickLine={false} />
                  <Tooltip formatter={v => compact(Number(v))} contentStyle={CHART.tooltip} />
                  <Line type="monotone" dataKey="y" name={a.y} stroke={CHART.series} strokeWidth={2} dot={false} />
                </LineChart>
              ) : (
                <BarChart data={data} margin={{ left: -6, right: 8, top: 8 }}>
                  <CartesianGrid stroke={CHART.grid} vertical={false} />
                  <XAxis dataKey="x" tick={CHART.axis} axisLine={false} tickLine={false} interval={0} angle={data.length > 8 ? -25 : 0} textAnchor={data.length > 8 ? 'end' : 'middle'} height={data.length > 8 ? 70 : 30} tickFormatter={v => String(v).slice(0, 20)} />
                  <YAxis tickFormatter={compact} tick={CHART.axis} axisLine={false} tickLine={false} />
                  <Tooltip formatter={v => compact(Number(v))} contentStyle={CHART.tooltip} cursor={CHART.cursor} />
                  <Bar dataKey="y" name={a.y} fill={CHART.series} radius={[2, 2, 0, 0]} maxBarSize={48} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}

        {a.rows.length > 0 && (
          <div className="mt-6 max-h-72 overflow-auto rounded-md border border-line">
            <table className="w-full">
              <thead className="sticky top-0"><tr>{a.columns.map(c => <th key={c} className="th">{c}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {a.rows.slice(0, 100).map((r, i) => (
                  <tr key={i} className="hover:bg-canvas">
                    {a.columns.map(c => <td key={c} className={clsx('td whitespace-nowrap text-xs', typeof r[c] === 'number' && 'text-right font-mono tabular-nums')}>
                      {typeof r[c] === 'number' ? r[c].toLocaleString('en-IN', { maximumFractionDigits: 2 }) : String(r[c] ?? '')}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            {a.total_rows > 100 && <div className="border-t border-line px-3 py-2 text-[11px] text-subtle">Showing 100 of {a.total_rows.toLocaleString()} rows</div>}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-4">
          {a.sql && <button onClick={() => setShowSql(o => !o)} className="flex items-center gap-1 text-xs text-muted hover:text-fg">
            <ChevronRight className={clsx('h-3.5 w-3.5 transition', showSql && 'rotate-90')} /> Generated SQL</button>}
          {a.attempts.length > 1 && <button onClick={() => setShowTry(o => !o)} className="flex items-center gap-1 text-xs text-warn hover:text-fg">
            <ChevronRight className={clsx('h-3.5 w-3.5 transition', showTry && 'rotate-90')} /> {a.attempts.length - 1} attempt(s) blocked by policy/gateway</button>}
        </div>
        {showSql && <div className="mt-3"><CodeBlock code={a.sql} /></div>}
        {showTry && <div className="mt-3 space-y-2">{a.attempts.map(t => (
          <div key={t.attempt} className="rounded-md border border-line p-3">
            <div className={clsx('mb-2 text-xs font-medium', t.result.startsWith('ok') ? 'text-good' : 'text-bad')}>#{t.attempt} · {t.result}</div>
            <CodeBlock code={t.sql} />
          </div>))}</div>}
      </div>
    </Card>
  )
}
