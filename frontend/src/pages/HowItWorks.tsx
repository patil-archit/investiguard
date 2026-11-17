import clsx from 'clsx'
import { Boxes, Database, GitBranch, Layers, MessageSquareText, Route, ShieldCheck, ShieldHalf, Workflow } from 'lucide-react'
import { BotMark as BrainCircuit } from '../components/brand'
import { useEffect, useState, type ReactNode } from 'react'
import { api, type Architecture } from '../api'
import { C4Diagram, C4Key, C4_DIAGRAMS } from '../components/C4'
import { Mermaid } from '../components/Mermaid'
import { Card, SectionTitle } from '../components/ui'
import { useStore } from '../store'

const ASK = `flowchart LR
  Q(["Question"]):::ui --> W["LLM writes SQL"]:::llm --> P["Gateway parses SQL<br/><small>exact columns used</small>"]:::code
  P --> D["Policy decides<br/><small>P1 P2 P3 P5</small>"]:::code --> C["One-shot capability<br/><small>120 s</small>"]:::code
  C --> X["Gateway executes<br/><small>read-only</small>"]:::code --> R["Readable money<br/><small>by code</small>"]:::code
  R --> A["LLM writes plain answer"]:::llm --> V["Revoke"]:::code
  D -. "DENY → reason fed back (≤ 3)" .-> W
  X -. "error → retry" .-> W
  classDef llm fill:#fdf3e6,stroke:#c48a3f,color:#5a3a12
  classDef code fill:#eaf4ee,stroke:#5c9a74,color:#173d27
  classDef ui fill:#EFEAE6,stroke:#B9ADA4,color:#2D2A26`

const PLANES = [
  { icon: <Layers className="h-4 w-4" />, swatch: 'bg-[#EFEAE6] border-[#B9ADA4]', title: 'Presentation',
    text: 'Starts investigations and questions, and streams every grant, denial, revocation and verdict live over server-sent events.' },
  { icon: <BrainCircuit className="h-4 w-4" />, swatch: 'bg-[#fdf3e6] border-[#c48a3f]', title: 'Reasoning · untrusted',
    text: 'LLM nodes can only request capabilities and submit SQL. Everything they produce, including text read from the data, is treated as untrusted input.' },
  { icon: <ShieldCheck className="h-4 w-4" />, swatch: 'bg-[#eaf4ee] border-[#5c9a74]', title: 'Control · trusted',
    text: 'Planner, policy engine, capability store and evidence engine are plain, testable code. No LLM takes part in any decision.' },
  { icon: <Database className="h-4 w-4" />, swatch: 'bg-[#F3DDD6] border-[#C2675A]', title: 'Data',
    text: 'The SQL gateway is the only path to the data. It resolves every column through the syntax tree and fails closed. The database itself is opened read-only.' },
]

const STEPS = [
  ['Understand', 'Extract the metric, both periods and the columns needed to compute it. Lookup questions are redirected to Ask.'],
  ['Hypothesize', 'Propose candidate drivers. Each one declares the columns it needs; code computes its privilege cost from their sensitivity.'],
  ['Plan', 'Rank by plausibility × information gain ÷ (1 + λ · privilege cost). Cheap, low-sensitivity explanations go first.'],
  ['Authorise', 'The policy engine checks P1–P5. ALLOW mints a signed 5-minute capability. DENY logs the reason; P4 denials retry once evidence exists.'],
  ['Query', 'The LLM sees only the granted columns and writes one SELECT in a fixed segment · baseline · incident shape.'],
  ['Enforce', 'The gateway verifies the token, resolves every column through the AST, and runs the query read-only with a row limit.'],
  ['Judge', 'The evidence engine computes explained share, lift, specificity and relabelling, and decides the verdict.'],
  ['Revoke', 'The capability is revoked. The loop continues until the stop rule is met; then the report is written, with claims required to cite evidence.'],
]

const tag = (tone: 'good' | 'bad' | 'warn' | 'llm') => clsx('inline-block rounded px-1.5 py-0.5 text-[11px] font-medium',
  tone === 'good' && 'bg-good-soft text-good', tone === 'bad' && 'bg-bad-soft text-bad',
  tone === 'warn' && 'bg-warn-soft text-warn', tone === 'llm' && 'bg-[#fdf3e6] text-[#8a5a1c]')

export default function HowItWorks() {
  const { dataset, datasets } = useStore()
  const [arch, setArch] = useState<Architecture | null>(null)
  const name = dataset?.name ?? datasets[0]?.name
  useEffect(() => { if (name) api.architecture(name).then(setArch).catch(() => setArch(null)) }, [name])

  return (
    <div className="space-y-12">
      <header className="border-b border-line pb-8">
        <div className="eyebrow">Design principle</div>
        <h1 className="mt-3 max-w-3xl text-[34px] font-semibold leading-[1.15] tracking-[-0.025em] text-fg">
          The LLM proposes.<br /><span className="text-muted">Deterministic code decides.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-fg-2">
          The model writes hypotheses, SQL and prose. It never decides which data it may read, whether a query may run,
          or whether a hypothesis is true. Those decisions are made by plain code that can be tested and audited.
        </p>
        <div className="mt-5 flex flex-wrap gap-5 text-xs text-muted">
          <Legend cls="bg-[#fdf3e6] border-[#c48a3f]" label="Untrusted (LLM output)" />
          <Legend cls="bg-[#eaf4ee] border-[#5c9a74]" label="Trusted deterministic code" />
          <Legend cls="bg-[#F3DDD6] border-[#C2675A]" label="Data" />
        </div>
      </header>

      <Section icon={<Boxes className="h-4 w-4" />} title="1 · System architecture"
        sub="C4 model: context → containers → components. Arrows point from caller to callee and read as “purpose [technology]”.">
        <Card className="divide-y divide-line">
          <div className="px-6 py-4"><C4Key /></div>
          {C4_DIAGRAMS.map(d => <div key={d.level} className="p-6"><C4Diagram d={d} /></div>)}
        </Card>
        <div className="mt-4 grid gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-2 xl:grid-cols-4">
          {PLANES.map(p => (
            <div key={p.title} className="bg-surface p-5">
              <div className="flex items-center gap-2 text-fg">
                <span className={clsx('h-2.5 w-2.5 rounded-sm border', p.swatch)} />
                <span className="text-sm font-semibold">{p.title}</span>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">{p.text}</p>
            </div>))}
        </div>
      </Section>

      <Section icon={<Route className="h-4 w-4" />} title="One request, end to end" sub="what happens after you press Run">
        <ol className="grid gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-2 xl:grid-cols-4">
          {STEPS.map(([t, d], i) => (
            <li key={t} className="bg-surface p-5">
              <div className="font-mono text-[11px] text-subtle">{String(i + 1).padStart(2, '0')}</div>
              <div className="mt-1 text-sm font-semibold text-fg">{t}</div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{d}</p>
            </li>))}
        </ol>
      </Section>

      {arch && (
        <>
          <Section icon={<ShieldHalf className="h-4 w-4" />} title="Policy engine" sub="deterministic rules, evaluated before every grant">
            <Table cols={['Rule', 'Name', 'What it enforces']} rows={arch.policy.map(p => [<span className="font-mono text-xs font-medium text-accent">{p.rule}</span>, p.name, p.enforces])} />
          </Section>

          <Section icon={<Workflow className="h-4 w-4" />} title="2 · LangGraph agent orchestration"
            sub="one StateGraph; every edge is a plain function of state, so the LLM never routes. Generated from the compiled graph.">
            <Card className="p-6"><Mermaid chart={arch.orchestration} /></Card>
            <div className="mt-4"><Table cols={['Node', 'Decided by', 'Reads', 'Produces', 'Guard-rails']}
              rows={arch.nodes.map(n => [<span className="font-mono text-xs text-fg">{n.node}</span>,
                <span className={tag(n.who === 'LLM' ? 'llm' : 'good')}>{n.who}</span>,
                n.reads, n.produces, n.guards])} /></div>
          </Section>

          <div className="grid gap-8 xl:grid-cols-2">
            <Section icon={<GitBranch className="h-4 w-4" />} title="Routing & stop rule">
              <Card className="space-y-3 p-5 text-[13px] leading-relaxed text-fg-2">
                <Route_ a="understand" b="hypothesize | not_investigation" why="change question vs direct lookup" />
                <Route_ a="plan" b="request_capability | report" why="next hypothesis, or stop rule met" />
                <Route_ a="request_capability" b="write_query | plan" why="ALLOW vs DENY" />
                <Route_ a="execute" b="interpret | write_query | give_up" why="ok · retry with the exact error (≤ 3) · give up" />
                <Route_ a="interpret / give_up" b="revoke → plan" why="capability always revoked before the next test" />
                <div className="rounded-md bg-sunken p-3.5 text-muted">
                  <b className="font-semibold text-fg">Stop</b> when the strongest supported driver explains ≥ {(arch.stop.share * 100).toFixed(0)}% of the change and
                  no drill-downs remain, after {arch.stop.iterations} iterations, or when no hypotheses remain. The largest single share is used, not a sum,
                  so overlapping hypotheses are never double-counted.
                </div>
              </Card>
            </Section>
            <Section icon={<ShieldCheck className="h-4 w-4" />} title="Evidence engine" sub="verdicts are computed, not generated">
              <Card className="p-5">
                <p className="mb-4 text-[13px] leading-relaxed text-muted">
                  Each test returns <code className="rounded bg-sunken px-1.5 py-0.5 font-mono text-xs text-fg">segment | baseline | incident</code> plus an
                  <code className="mx-1 rounded bg-sunken px-1.5 py-0.5 font-mono text-xs text-fg">ALL</code> row. Explained share = |top segment change| ÷ |total change|;
                  lift = share ÷ the segment's baseline size.
                </p>
                <div className="divide-y divide-line rounded-md border border-line">{arch.evidence.map(r => (
                  <div key={r.condition} className="flex items-start justify-between gap-4 px-3 py-2.5">
                    <span className="text-[12.5px] text-fg-2">{r.condition}</span>
                    <span className={clsx('shrink-0', tag(r.verdict.startsWith('SUPPORTED') ? 'good' : r.verdict.startsWith('REJECTED') ? 'bad' : 'warn'))}>{r.verdict}</span>
                  </div>))}</div>
              </Card>
            </Section>
          </div>

          <Section icon={<Layers className="h-4 w-4" />} title="Shared graph state">
            <Table cols={['Field', 'Holds']} rows={arch.state.map(s => [<span className="font-mono text-xs text-fg">{s.field}</span>, s.holds])} />
          </Section>
        </>
      )}

      <Section icon={<MessageSquareText className="h-4 w-4" />} title="3 · Ask your data" sub="separate feature, same trust boundary">
        <Card className="p-6"><Mermaid chart={ASK} /></Card>
      </Section>

      {arch && (
        <Section icon={<ShieldHalf className="h-4 w-4" />} title="4 · Threats and what stops them">
          <Table cols={['Threat', 'Stopped by', 'Status']} rows={arch.threats.map(t => [t.threat, t.stopped_by,
            <span className={tag(t.status.startsWith('Planned') ? 'warn' : 'good')}>{t.status}</span>])} />
        </Section>
      )}
    </div>
  )
}

function Section({ icon, title, sub, children }: { icon: ReactNode; title: string; sub?: string; children: ReactNode }) {
  return <section><SectionTitle icon={icon} title={title} sub={sub} />{children}</section>
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return <span className="flex items-center gap-2"><span className={clsx('h-2.5 w-2.5 rounded-sm border', cls)} />{label}</span>
}

function Route_({ a, b, why }: { a: string; b: string; why: string }) {
  return <div className="flex flex-wrap items-center gap-2">
    <span className="font-mono text-xs text-fg">{a}</span><span className="text-subtle">→</span>
    <span className="font-mono text-xs text-accent">{b}</span><span className="text-xs text-muted">· {why}</span></div>
}

function Table({ cols, rows }: { cols: string[]; rows: ReactNode[][] }) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full">
        <thead className="border-b border-line"><tr>{cols.map(c => <th key={c} className="th">{c}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => <tr key={i} className="hover:bg-canvas">{r.map((c, j) => <td key={j} className="td text-[13px]">{c}</td>)}</tr>)}
        </tbody>
      </table>
    </Card>
  )
}
