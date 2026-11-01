import clsx from 'clsx'
import { Boxes, BrainCircuit, Database, GitBranch, Layers, MessageSquareText, Route, ShieldCheck, ShieldHalf, Workflow } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { api, type Architecture } from '../api'
import { Mermaid } from '../components/Mermaid'
import { Card, Chip, SectionTitle } from '../components/ui'
import { useStore } from '../store'

const ARCH = `flowchart TB
  subgraph P["Presentation plane"]
    direction LR
    U(["Analyst"]):::ui --> S["React studio<br/><small>Investigate · Ask · Compare · Data</small>"]:::ui
  end
  subgraph R["Reasoning plane — UNTRUSTED"]
    direction LR
    AG["LangGraph agent<br/><small>understand · hypothesize · write_query · interpret · report</small>"]:::llm
    LLM[["LLM<br/><small>structured JSON outputs</small>"]]:::llm
    AS["Ask-your-data<br/><small>NL → SQL → answer</small>"]:::llm
    AG <-.-> LLM <-.-> AS
  end
  subgraph C["Control plane — TRUSTED code, no LLM"]
    direction LR
    PL["Planner<br/><small>cheapest privilege first</small>"]:::code --> PO["Policy engine<br/><small>P1–P5</small>"]:::code -- ALLOW --> CA["Capability store<br/><small>signed · TTL · revoke</small>"]:::code
    EV["Evidence engine<br/><small>share · lift · relabel</small>"]:::code
    AU["Audit & provenance"]:::code
  end
  subgraph D["Data plane"]
    direction LR
    CT["Catalogue<br/><small>sensitivity · gates</small>"]:::data
    GW["SQL gateway<br/><small>AST column check · COUNT-only · row limit</small>"]:::code -- checked SELECT --> DB[("Read-only database")]:::data
  end
  S --> AG & AS
  AG -- hypotheses --> PL
  PO -. reads .-> CT
  AG -- "SQL + token" --> GW
  AS -- "SQL + token" --> GW
  GW -. verify .-> CA
  GW -- rows --> EV -- verdict --> AG
  EV --> AU
  AU -. live events .-> S
  classDef llm fill:#3b1d2e,stroke:#f472b6,color:#fde7f3
  classDef code fill:#0f2e26,stroke:#34d399,color:#d1fae5
  classDef data fill:#132544,stroke:#60a5fa,color:#dbeafe
  classDef ui fill:#241b45,stroke:#a78bfa,color:#ede9fe`

const ASK = `flowchart LR
  Q(["Question"]):::ui --> W["LLM writes SQL"]:::llm --> P["Gateway parses SQL<br/><small>exact columns used</small>"]:::code
  P --> D["Policy decides<br/><small>P1 P2 P3 P5</small>"]:::code --> C["One-shot capability<br/><small>120 s</small>"]:::code
  C --> X["Gateway executes<br/><small>read-only</small>"]:::code --> R["Readable money<br/><small>by code</small>"]:::code
  R --> A["LLM writes plain answer"]:::llm --> V["Revoke"]:::code
  D -. "DENY → reason fed back (≤ 3)" .-> W
  X -. "error → retry" .-> W
  classDef llm fill:#3b1d2e,stroke:#f472b6,color:#fde7f3
  classDef code fill:#0f2e26,stroke:#34d399,color:#d1fae5
  classDef ui fill:#241b45,stroke:#a78bfa,color:#ede9fe`

const PLANES = [
  { icon: <Layers className="h-5 w-5" />, color: 'text-violet-300 bg-violet-500/15', title: 'Presentation',
    text: 'Starts investigations and questions, and streams every grant, denial, revocation and verdict live over server-sent events.' },
  { icon: <BrainCircuit className="h-5 w-5" />, color: 'text-pink-300 bg-pink-500/15', title: 'Reasoning · untrusted',
    text: 'LLM nodes can only request capabilities and submit SQL. Everything they produce, including text read from the data, is treated as untrusted input.' },
  { icon: <ShieldCheck className="h-5 w-5" />, color: 'text-emerald-300 bg-emerald-500/15', title: 'Control · trusted',
    text: 'Planner, policy engine, capability store and evidence engine are plain, testable code. No LLM takes part in any decision.' },
  { icon: <Database className="h-5 w-5" />, color: 'text-sky-300 bg-sky-500/15', title: 'Data',
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

export default function HowItWorks() {
  const { dataset, datasets } = useStore()
  const [arch, setArch] = useState<Architecture | null>(null)
  const name = dataset?.name ?? datasets[0]?.name
  useEffect(() => { if (name) api.architecture(name).then(setArch).catch(() => setArch(null)) }, [name])

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-gradient-to-br from-indigo-500/[0.15] via-ink-900 to-cyan-500/[0.08] p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />
        <Chip tone="accent">Design principle</Chip>
        <h1 className="mt-3 max-w-3xl text-3xl font-extrabold leading-tight tracking-tight text-white">
          The LLM <span className="gradient-text">proposes</span>. Deterministic code <span className="gradient-text">decides</span>.
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-300">
          The model writes hypotheses, SQL and prose. It never decides which data it may read, whether a query may run,
          or whether a hypothesis is true. Those decisions are made by plain code that can be tested and audited.
        </p>
        <div className="mt-5 flex flex-wrap gap-2 text-xs">
          <Legend cls="bg-pink-500/20 ring-pink-400/40" label="untrusted (LLM output)" />
          <Legend cls="bg-emerald-500/20 ring-emerald-400/40" label="trusted deterministic code" />
          <Legend cls="bg-sky-500/20 ring-sky-400/40" label="data" />
        </div>
      </div>

      <Section icon={<Boxes className="h-4 w-4" />} title="1 · System architecture" sub="four planes separated by an explicit trust boundary">
        <Card className="p-6"><Mermaid chart={ARCH} /></Card>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {PLANES.map(p => (
            <Card key={p.title} className="card-hover p-5">
              <div className={clsx('mb-3 grid h-10 w-10 place-items-center rounded-xl', p.color)}>{p.icon}</div>
              <div className="font-semibold text-white">{p.title}</div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400">{p.text}</p>
            </Card>))}
        </div>
      </Section>

      <Section icon={<Route className="h-4 w-4" />} title="One request, end to end" sub="what happens after you press Run">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {STEPS.map(([t, d], i) => (
            <Card key={t} className="relative p-5">
              <div className="absolute right-4 top-4 font-mono text-3xl font-extrabold text-white/[0.06]">{String(i + 1).padStart(2, '0')}</div>
              <div className="text-sm font-semibold text-indigo-200">{t}</div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400">{d}</p>
            </Card>))}
        </div>
      </Section>

      {arch && (
        <>
          <Section icon={<ShieldHalf className="h-4 w-4" />} title="Policy engine" sub="deterministic rules, evaluated before every grant">
            <Table cols={['Rule', 'Name', 'What it enforces']} rows={arch.policy.map(p => [<Chip tone="accent">{p.rule}</Chip>, p.name, p.enforces])} />
          </Section>

          <Section icon={<Workflow className="h-4 w-4" />} title="2 · LangGraph agent orchestration"
            sub="one StateGraph; every edge is a plain function of state, so the LLM never routes. Generated from the compiled graph.">
            <Card className="p-6"><Mermaid chart={arch.orchestration} /></Card>
            <div className="mt-4"><Table cols={['Node', 'Decided by', 'Reads', 'Produces', 'Guard-rails']}
              rows={arch.nodes.map(n => [<span className="font-mono text-xs text-white">{n.node}</span>,
                <span className={clsx('rounded-md px-2 py-0.5 text-[11px] font-semibold', n.who === 'LLM' ? 'bg-pink-500/15 text-pink-200' : 'bg-emerald-500/15 text-emerald-200')}>{n.who}</span>,
                n.reads, n.produces, n.guards])} /></div>
          </Section>

          <div className="grid gap-6 xl:grid-cols-2">
            <Section icon={<GitBranch className="h-4 w-4" />} title="Routing & stop rule">
              <Card className="space-y-3 p-5 text-[13px] leading-relaxed text-slate-300">
                <Route_ a="understand" b="hypothesize | not_investigation" why="change question vs direct lookup" />
                <Route_ a="plan" b="request_capability | report" why="next hypothesis, or stop rule met" />
                <Route_ a="request_capability" b="write_query | plan" why="ALLOW vs DENY" />
                <Route_ a="execute" b="interpret | write_query | give_up" why="ok · retry with the exact error (≤ 3) · give up" />
                <Route_ a="interpret / give_up" b="revoke → plan" why="capability always revoked before the next test" />
                <div className="rounded-xl bg-white/[0.03] p-3.5 text-slate-400 ring-1 ring-white/5">
                  <b className="text-slate-200">Stop</b> when the strongest supported driver explains ≥ {(arch.stop.share * 100).toFixed(0)}% of the change and
                  no drill-downs remain, after {arch.stop.iterations} iterations, or when no hypotheses remain. The largest single share is used, not a sum,
                  so overlapping hypotheses are never double-counted.
                </div>
              </Card>
            </Section>
            <Section icon={<ShieldCheck className="h-4 w-4" />} title="Evidence engine" sub="verdicts are computed, not generated">
              <Card className="p-5">
                <p className="mb-3 text-[13px] leading-relaxed text-slate-400">
                  Each test returns <code className="rounded bg-white/5 px-1.5 font-mono text-xs text-sky-200">segment | baseline | incident</code> plus an
                  <code className="mx-1 rounded bg-white/5 px-1.5 font-mono text-xs text-sky-200">ALL</code> row. Explained share = |top segment change| ÷ |total change|;
                  lift = share ÷ the segment's baseline size.
                </p>
                <div className="space-y-2">{arch.evidence.map(r => (
                  <div key={r.condition} className="flex items-start justify-between gap-4 rounded-lg bg-white/[0.02] px-3 py-2 ring-1 ring-white/5">
                    <span className="text-[12.5px] text-slate-300">{r.condition}</span>
                    <span className={clsx('shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold', r.verdict.startsWith('SUPPORTED') ? 'bg-emerald-500/15 text-emerald-300'
                      : r.verdict.startsWith('REJECTED') ? 'bg-rose-500/15 text-rose-300' : 'bg-amber-500/15 text-amber-300')}>{r.verdict}</span>
                  </div>))}</div>
              </Card>
            </Section>
          </div>

          <Section icon={<Layers className="h-4 w-4" />} title="Shared graph state">
            <Table cols={['Field', 'Holds']} rows={arch.state.map(s => [<span className="font-mono text-xs text-white">{s.field}</span>, s.holds])} />
          </Section>
        </>
      )}

      <Section icon={<MessageSquareText className="h-4 w-4" />} title="3 · Ask your data" sub="separate feature, same trust boundary">
        <Card className="p-6"><Mermaid chart={ASK} /></Card>
      </Section>

      {arch && (
        <Section icon={<ShieldHalf className="h-4 w-4" />} title="4 · Threats and what stops them">
          <Table cols={['Threat', 'Stopped by', 'Status']} rows={arch.threats.map(t => [t.threat, t.stopped_by,
            <span className={clsx('rounded-md px-2 py-0.5 text-[11px] font-semibold', t.status.startsWith('Planned') ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300')}>{t.status}</span>])} />
        </Section>
      )}
    </div>
  )
}

function Section({ icon, title, sub, children }: { icon: ReactNode; title: string; sub?: string; children: ReactNode }) {
  return <section><SectionTitle icon={icon} title={title} sub={sub} />{children}</section>
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return <span className="flex items-center gap-2 rounded-full bg-black/20 px-3 py-1 text-slate-300 ring-1 ring-white/10"><span className={clsx('h-2.5 w-2.5 rounded-sm ring-1', cls)} />{label}</span>
}

function Route_({ a, b, why }: { a: string; b: string; why: string }) {
  return <div className="flex flex-wrap items-center gap-2">
    <span className="font-mono text-xs text-indigo-200">{a}</span><span className="text-slate-600">→</span>
    <span className="font-mono text-xs text-cyan-200">{b}</span><span className="text-xs text-slate-500">· {why}</span></div>
}

function Table({ cols, rows }: { cols: string[]; rows: ReactNode[][] }) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full">
        <thead className="border-b border-white/[0.06]"><tr>{cols.map(c => <th key={c} className="th">{c}</th>)}</tr></thead>
        <tbody className="divide-y divide-white/[0.04]">
          {rows.map((r, i) => <tr key={i} className="hover:bg-white/[0.015]">{r.map((c, j) => <td key={j} className="td text-[13px]">{c}</td>)}</tr>)}
        </tbody>
      </table>
    </Card>
  )
}
