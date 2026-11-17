import clsx from 'clsx'
import { Download, FileCheck2, FileWarning, ShieldQuestion } from 'lucide-react'
import { useState } from 'react'
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api, type LedgerView, type Privilege, type Receipt } from '../api'
import { Button, CHART, Card, Chip } from './ui'

/** Step value of a privilege curve at time t (columns stay open until the next grant/revoke). */
const at = (p: Privilege, t: number) => {
  let v = 0
  for (const pt of p.curve) { if (pt.t <= t) v = pt.columns; else break }
  return v
}

/** Columns open to the agent over time. One series, or InvestiGuard against Direct AI. */
export function PrivilegeChart({ series, height = 200 }: { series: { name: string; privilege: Privilege; color: string }[]; height?: number }) {
  const times = [...new Set(series.flatMap(s => s.privilege.curve.map(p => p.t)))].sort((a, b) => a - b)
  const data = times.map(t => Object.fromEntries([['t', t], ...series.map(s => [s.name, at(s.privilege, t)])]))
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ left: -14, right: 8, top: 6 }}>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="t" type="number" domain={[0, 'dataMax']} tickFormatter={v => `${Number(v).toFixed(0)}s`} tick={CHART.axis} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={CHART.axis} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={CHART.tooltip} labelFormatter={v => `${Number(v).toFixed(1)} s into the run`} formatter={v => [`${v} columns open`]} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11, color: '#776C63' }} iconType="square" iconSize={8} />}
          {series.map(s => (
            <Area key={s.name} type="stepAfter" dataKey={s.name} stroke={s.color} fill={s.color} fillOpacity={0.14} strokeWidth={1.6} isAnimationActive={false} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

const short = (h: string) => `${h.slice(0, 10)}…${h.slice(-8)}`

/** The sealed hash chain of a run, with live re-verification and a tamper demonstration. */
export function ReceiptCard({ runId, receipt }: { runId: string; receipt: Receipt }) {
  const [view, setView] = useState<LedgerView | null>(null)
  const [busy, setBusy] = useState(false)
  const check = async (tamper: boolean) => {
    setBusy(true)
    try { setView(await api.ledger(runId, tamper)) } finally { setBusy(false) }
  }
  const download = async () => {
    const full = await api.ledger(runId)
    const url = URL.createObjectURL(new Blob([JSON.stringify(full, null, 2)], { type: 'application/json' }))
    Object.assign(document.createElement('a'), { href: url, download: `investiguard-receipt-${runId}.json` }).click()
    URL.revokeObjectURL(url)
  }
  const v = view?.verification
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="eyebrow">Access receipt</div>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted">
            Every grant, denial, query and revocation of this run is chained by hash and sealed with a signature.
            Editing, dropping or reordering any entry afterwards breaks the seal.
          </p>
          <dl className="mt-3 grid gap-x-8 gap-y-1.5 text-xs sm:grid-cols-[auto_1fr]">
            <dt className="text-subtle">Entries</dt><dd className="font-mono text-fg-2">{receipt.entries}</dd>
            <dt className="text-subtle">Root hash</dt><dd className="truncate font-mono text-fg-2" title={receipt.root_hash}>{short(receipt.root_hash)}</dd>
            <dt className="text-subtle">Signature</dt><dd className="truncate font-mono text-fg-2" title={receipt.signature}>{short(receipt.signature)}</dd>
            <dt className="text-subtle">Method</dt><dd className="text-fg-2">{receipt.algorithm}</dd>
          </dl>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="secondary" onClick={() => check(false)} loading={busy}>Verify now</Button>
          <Button variant="ghost" onClick={() => check(true)} disabled={busy}>Simulate tampering</Button>
          <Button variant="ghost" onClick={download} aria-label="Download receipt"><Download className="h-4 w-4" /></Button>
        </div>
      </div>
      {v && (
        <div className={clsx('mt-4 flex items-start gap-2.5 rounded-md border px-4 py-3 text-sm',
          v.valid ? 'border-good/25 bg-good-soft text-good' : 'border-bad/25 bg-bad-soft text-bad')}>
          {v.valid ? <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0" /> : <FileWarning className="mt-0.5 h-4 w-4 shrink-0" />}
          <div>
            <b className="font-semibold">{v.valid ? 'Verified: the log matches the receipt.' : 'Verification failed.'}</b>{' '}
            {view!.tampered
              ? 'One grant in a copy of the log was edited to “all columns”; the recomputed root hash no longer matches, so the change is detected.'
              : `Recomputed the chain over ${view!.entries.length} entries just now.`}
            <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
              {Object.entries(v.checks).map(([k, ok]) => <Chip key={k} tone={ok ? 'default' : 'warn'}>{k.replace('_', ' ')} {ok ? '✓' : '✗'}</Chip>)}
            </span>
          </div>
        </div>
      )}
    </Card>
  )
}

/** Shown while the run is paused on a step-up approval. */
export function ApprovalBanner({ runId, ask, onDone }: {
  runId: string
  ask: { hypothesis: string; statement: string; check: string; reason: string; resources: string[] }
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const decide = async (approve: boolean) => {
    setBusy(true); setError(null)
    try { await api.approve(runId, ask.hypothesis, approve); onDone() }
    catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="rounded-lg border border-warn/30 bg-warn-soft p-5 animate-fade-in">
      <div className="flex items-start gap-3">
        <ShieldQuestion className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-fg">The agent is waiting for your approval</div>
          <p className="mt-1 text-[13px] leading-relaxed text-fg-2">
            <b className="font-medium">{ask.hypothesis}</b>: {ask.statement}
          </p>
          <p className="mt-1 text-[13px] text-muted">Blocked by <b className="font-medium text-warn">{ask.check}</b>: {ask.reason}</p>
          <div className="mt-2 flex flex-wrap gap-1">{ask.resources.map(r => <Chip key={r} mono>{r}</Chip>)}</div>
          <p className="mt-2 text-[11.5px] text-muted">Approving opens only these columns, for at most 2 minutes, for this one test. Restricted columns can never be approved.</p>
          {error && <p className="mt-2 text-xs text-bad">{error}</p>}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" onClick={() => decide(false)} disabled={busy}>Deny</Button>
          <Button onClick={() => decide(true)} loading={busy}>Approve once</Button>
        </div>
      </div>
    </div>
  )
}
