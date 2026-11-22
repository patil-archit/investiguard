import clsx from 'clsx'
import { useEffect, useState, type ReactNode } from 'react'
import { api, type Architecture } from '../api'
import { Deployment, Lifecycle, PlaneDiagram, Sequence, StateMachine } from '../components/Arch'
import { C, Mascot, Marquee, Reveal, Sticker } from '../components/brand'
import { C4Diagram, C4Key, C4_DIAGRAMS } from '../components/C4'
import { Term } from '../components/gloss'
import { Mermaid } from '../components/Mermaid'
import { useStore } from '../store'

const TOC = [
  ['planes', 'Four planes'], ['c4', 'C4 model'], ['states', 'State machines'], ['sequence', 'Sequence'],
  ['deployment', 'Deployment'], ['graph', 'LangGraph'], ['rules', 'Rules & scoring'], ['threats', 'Threat model'], ['config', 'Configuration'],
] as const

const POLICY_CARDS = [
  ['P1', 'Read-only', 'Only READ operations exist. Write, update, delete: never.', C.ink],
  ['P2', 'Sensitivity ceiling', 'Restricted columns are never granted; confidential ones are count-only.', C.oxblood],
  ['P3', 'Declared scope', 'A key can only cover the columns the guess declared when it was made.', C.scarlet],
  ['P4', 'Evidence gate', 'Sensitive tables open only after a related finding is confirmed.', C.tangerine],
  ['P5', 'Budgets', 'Key lifetime ≤ 900 s, at most 4 keys at once, capped sensitive columns.', '#8a6d1f'],
] as const

const CONFIG = [
  ['Key lifetime (TTL)', '300 s default · 900 s maximum'], ['Keys active at once (k_max)', '4'], ['Gateway row limit / timeout', '10,000 rows · 10 s'],
  ['Planner weight λ', '0.5'], ['Evidence thresholds', 'support E ≥ 0.40 ∧ lift ≥ 1.5 · reject E < 0.15'], ['Synopsis score', '0.5·E + 0.3·S + 0.2·T'],
  ['Stop condition', '≥ 80% of the change explained'], ['Iterations / query retries', '16 / 3'], ['Sandbox', '1 CPU · 512 MB · 64 pids · no network'],
  ['Analyst approval waiver', 'P4 / P5 only · 120 s · once'], ['Receipt', 'SHA-256 chain + HMAC-SHA256'], ['LLM', 'gpt-4o-mini · JSON-schema outputs'],
]

export default function HowItWorks() {
  const { dataset, datasets } = useStore()
  const [arch, setArch] = useState<Architecture | null>(null)
  const name = dataset?.name ?? datasets[0]?.name
  useEffect(() => { if (name) api.architecture(name).then(setArch).catch(() => setArch(null)) }, [name])

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[26px] bg-ink px-5 pb-9 pt-9 text-paper sm:px-9">
        <Sticker r={-4} className="bg-mustard text-ink">System architecture</Sticker>
        <h1 className="display mt-5 max-w-4xl text-[clamp(44px,6.4vw,100px)]">The AI proposes.<br /><span className="text-blush">Code decides.</span></h1>
        <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-paper/80">
          The model writes guesses, SQL and prose. It never decides what it may read, whether a query may run, or what is true.
          Those calls belong to plain code you can test. Every diagram below uses a standard notation (C4, UML 2.5) with its key.
        </p>
        <Mascot size={200} mood="cool" head={C.blush} className="absolute -right-6 bottom-0 hidden rotate-[-8deg] lg:block" />
      </section>

      <nav className="sticky top-[76px] z-20 -mx-1 flex gap-1.5 overflow-x-auto rounded-[14px] bg-paper/90 p-1.5 backdrop-blur">
        {TOC.map(([id, l], i) => (
          <a key={id} href={`#/how`} onClick={e => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}
            className="shrink-0 rounded-[9px] bg-surface px-3 py-1.5 font-label text-[10.5px] font-bold uppercase tracking-[0.06em] text-ink transition hover:bg-ink hover:text-paper">
            <span className="mr-1.5 text-muted">{String(i + 1).padStart(2, '0')}</span>{l}
          </a>
        ))}
      </nav>

      <Block id="planes" n="01" title="Four planes, one trust boundary" kicker="synopsis figure 5.1 · interactive"
        sub={<>Everything inside the red dashed line is <b>untrusted</b>: the LLM and any code it writes. Trusted code sits outside and holds every key. Press play to follow one request.</>}>
        <PlaneDiagram />
      </Block>

      <Block id="c4" n="02" title="C4 model: context → containers → components" kicker="Simon Brown's C4 notation"
        sub="Level 1 shows who uses the system, level 2 the separately running parts, level 3 the components inside the API. Arrows point from caller to callee and read “purpose [technology]”.">
        <div className="rounded-[14px] bg-sunken px-4 py-3"><C4Key /></div>
        <div className="mt-4 space-y-8">{C4_DIAGRAMS.map(d => <Reveal key={d.level}><C4Diagram d={d} /></Reveal>)}</div>
      </Block>

      <Block id="states" n="03" title="State machines" kicker="UML 2.5 · synopsis figure 5.2"
        sub="Top: the investigation loop. Every arrow out of a diamond is a guard evaluated by code, never by the LLM. Bottom: the life of one guess.">
        <StateMachine />
        <div className="mt-6 grid items-center gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Lifecycle />
          <div className="space-y-3 text-[13.5px] leading-relaxed text-fg-2">
            <p><b className="text-ink">A guess can only end three ways</b>, and code picks which: supported, rejected or inconclusive.</p>
            <p>If the rules block it, it waits. When a related finding appears later, the <Term t="evidence gate">evidence gate</Term> lets it retry once.</p>
            <p>The moment a verdict is reached, its <Term t="capability">key</Term> is destroyed, whatever the verdict.</p>
          </div>
        </div>
      </Block>

      <Block id="sequence" n="04" title="One guess, message by message" kicker="UML sequence diagram"
        sub="What happens between pressing Investigate and reading the report, for a single hypothesis. The alt fragment shows the two outcomes of the policy check.">
        <Sequence />
      </Block>

      <Block id="deployment" n="05" title="Where it runs" kicker="UML deployment diagram"
        sub="One machine runs the API; Docker runs the sandbox with no network; the database is opened read-only; the LLM is an outside service whose output is untrusted.">
        <Deployment />
      </Block>

      {arch && (
        <Block id="graph" n="06" title="The LangGraph agent" kicker="generated from the compiled graph"
          sub="Every edge is a plain function of the state, so the LLM never routes. Orange nodes call the LLM; the rest are code.">
          <div className="rounded-[14px] bg-surface p-4"><Mermaid chart={arch.orchestration} /></div>
          <Table cols={['Node', 'Decided by', 'Reads', 'Produces', 'Guard-rails']}
            rows={arch.nodes.map(n => [<span className="font-mono text-xs text-ink">{n.node}</span>,
              <span className={clsx('rounded-[5px] px-1.5 py-0.5 font-label text-[9.5px] font-bold uppercase', n.who === 'LLM' ? 'bg-[#fce4d8] text-tangerine' : 'bg-good text-paper')}>{n.who}</span>,
              n.reads, n.produces, n.guards])} />
        </Block>
      )}

      <Block id="rules" n="07" title="Five rules and one formula" kicker="policy engine · evidence engine"
        sub="The rules decide what may be read. The formula decides what is true. Both are deterministic.">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {POLICY_CARDS.map(([p, n, t, bg], i) => (
            <Reveal key={p} delay={i * 80}>
              <div className="h-full rounded-[16px] p-4 text-paper transition hover:-translate-y-1" style={{ background: bg }}>
                <div className="font-display text-[34px] leading-none">{p}</div>
                <div className="mt-2 font-label text-[11px] font-bold uppercase tracking-[0.08em]">{n}</div>
                <p className="mt-2 text-[12.5px] leading-snug opacity-90">{t}</p>
                {['P4', 'P5'].includes(p) && <div className="mt-3 inline-block rounded-full bg-paper/20 px-2 py-0.5 font-label text-[9px] font-bold uppercase">you may waive once</div>}
              </div>
            </Reveal>
          ))}
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-[18px] bg-ink p-6 text-paper">
            <div className="font-label text-[10px] font-bold uppercase tracking-[0.14em] text-blush">evidence score (synopsis 5.3d)</div>
            <div className="mt-3 font-display text-[clamp(28px,3.4vw,44px)] leading-tight">
              Score = 0.5<span className="text-mustard">E</span> + 0.3<span className="text-blush">S</span> + 0.2<span className="text-tangerine">T</span>
            </div>
            <div className="mt-4 space-y-2 text-[13px] text-paper/85">
              <p><b className="text-mustard">E</b> · <Term t="explained share">explained share</Term>: how much of the change this one cause covers.</p>
              <p><b className="text-blush">S</b> · significance, 1 − p from a robust z-score: is it unusual compared with the rest?</p>
              <p><b className="text-tangerine">T</b> · timing: did it start moving when the metric did? Filled in by the onset drill-down.</p>
            </div>
            <div className="mt-4 rounded-[10px] bg-paper/10 px-3 py-2 font-mono text-[12px]">
              priority(h) = plausibility × info_gain ÷ (1 + 0.5 · privilege_cost)
            </div>
          </div>
          {arch && (
            <div className="rounded-[18px] border-[1.5px] border-line bg-surface">
              <div className="border-b-[1.5px] border-line px-5 py-3 font-label text-[10px] font-bold uppercase tracking-[0.12em] text-oxblood">verdict rules</div>
              <div className="divide-y-[1.5px] divide-line">{arch.evidence.map(r => (
                <div key={r.condition} className="flex items-start justify-between gap-4 px-5 py-3">
                  <span className="text-[13px] text-fg-2">{r.condition}</span>
                  <span className={clsx('shrink-0 rounded-[5px] px-1.5 py-0.5 font-label text-[9.5px] font-bold uppercase',
                    r.verdict.startsWith('SUPPORTED') ? 'bg-good text-paper' : r.verdict.startsWith('REJECTED') ? 'bg-scarlet text-paper' : 'bg-mustard text-ink')}>{r.verdict}</span>
                </div>))}</div>
              <div className="border-t-[1.5px] border-line px-5 py-3 text-[12.5px] text-muted">
                Stops when the strongest supported cause explains ≥ {(arch.stop.share * 100).toFixed(0)}% of the change, or after {arch.stop.iterations} iterations.
              </div>
            </div>
          )}
        </div>
      </Block>

      {arch && (
        <Block id="threats" n="08" title="Threat model" kicker="what can go wrong, and what stops it"
          sub="Each threat is tested by the automated suite. Fire them yourself in the Security lab.">
          <Table cols={['Threat', 'Stopped by', 'Status']} rows={arch.threats.map(t => [t.threat, t.stopped_by,
            <span className={clsx('rounded-[5px] px-1.5 py-0.5 font-label text-[9.5px] font-bold uppercase', t.status.startsWith('Planned') ? 'bg-mustard text-ink' : 'bg-good text-paper')}>{t.status}</span>])} />
        </Block>
      )}

      <Block id="config" n="09" title="Configuration" kicker="synopsis table 5.3" sub="The tunable numbers. Nothing is learned; there is no model training.">
        <div className="grid gap-px overflow-hidden rounded-[14px] bg-line sm:grid-cols-2 lg:grid-cols-3">
          {CONFIG.map(([k, v]) => (
            <div key={k} className="bg-surface px-4 py-3">
              <div className="font-label text-[9.5px] font-bold uppercase tracking-[0.1em] text-muted">{k}</div>
              <div className="mt-1 font-mono text-[13px] text-ink">{v}</div>
            </div>
          ))}
        </div>
      </Block>

      <Marquee items={['C4 model', 'UML 2.5', 'Trust boundary', 'Least privilege', 'Fail closed', 'Defence in depth']} sep="✶"
        className="rounded-[14px] bg-mustard py-3 font-label text-[12px] font-bold uppercase tracking-[0.1em] text-ink" />
    </div>
  )
}

function Block({ id, n, title, kicker, sub, children }: { id: string; n: string; title: string; kicker: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-36 overflow-hidden">
      <div className="flex items-start gap-4 border-b-[1.5px] border-line px-5 pb-4 pt-5 sm:px-6">
        <span className="font-display text-[40px] leading-none text-blush">{n}</span>
        <div>
          <div className="font-label text-[9.5px] font-bold uppercase tracking-[0.14em] text-oxblood">{kicker}</div>
          <h2 className="display mt-1 text-[clamp(22px,2.6vw,32px)] text-ink">{title}</h2>
          {sub && <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-muted">{sub}</p>}
        </div>
      </div>
      <div className="p-4 sm:p-6">{children}</div>
    </section>
  )
}

function Table({ cols, rows }: { cols: string[]; rows: ReactNode[][] }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-[14px] border-[1.5px] border-line">
      <table className="w-full bg-surface">
        <thead><tr>{cols.map(c => <th key={c} className="th">{c}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => <tr key={i} className="hover:bg-blush/15">{r.map((c, j) => <td key={j} className="td text-[13px]">{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  )
}
