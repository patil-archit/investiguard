/**
 * Architecture diagrams in standard notations, hand-laid-out SVG:
 *   PlaneDiagram   the synopsis's four-plane view (Fig 5.1), interactive, with a numbered request replay
 *   StateMachine   UML 2.5 state machine of the investigation loop (Fig 5.2)
 *   Lifecycle      UML state machine of one hypothesis
 *   Sequence       UML sequence diagram of one hypothesis test, with an alt fragment
 *   Deployment     UML deployment diagram: devices, execution environments, artifacts
 */
import clsx from 'clsx'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { C } from './brand'

const INK = C.ink, MUTED = '#776c63'
const FONT = { fontFamily: 'Geist, sans-serif' }
const MONO = 'Space Mono, monospace'

function useVisible<T extends Element>() {
  const ref = useRef<T>(null)
  const [on, setOn] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect() } }, { threshold: 0.2 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return [ref, on] as const
}

function Arrowheads({ id, color = INK }: { id: string; color?: string }) {
  return (
    <defs>
      <marker id={`${id}-solid`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" fill={color} />
      </marker>
      <marker id={`${id}-open`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10" fill="none" stroke={color} strokeWidth="1.4" />
      </marker>
      <marker id={`${id}-red`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" fill={C.scarlet} />
      </marker>
    </defs>
  )
}

/* ======================================================================= four planes */

interface Comp { id: string; x: number; y: number; w: number; label: string; desc: string }
interface Plane { name: string; sub: string; x: number; y: number; w: number; h: number; fill: string; stroke: string; comps: Comp[] }

const PLANES: Plane[] = [
  { name: 'Presentation plane', sub: 'Agent Studio · React + TypeScript · Tailwind · Recharts', x: 20, y: 18, w: 1160, h: 112, fill: '#efeae6', stroke: INK, comps: [
    { id: 'p1', x: 40, y: 60, w: 210, label: 'New investigation', desc: 'You type the business problem and pick System A, B or C.' },
    { id: 'p2', x: 265, y: 60, w: 210, label: 'Evidence graph', desc: 'Live provenance: problem → guess → key → query → verdict.' },
    { id: 'p3', x: 490, y: 60, w: 210, label: 'Permission timeline', desc: 'A Gantt bar for every key from issue to revocation.' },
    { id: 'p4', x: 715, y: 60, w: 210, label: 'Security alerts', desc: 'Every rule block, gateway block and masked injection, in plain words.' },
    { id: 'p5', x: 940, y: 60, w: 220, label: 'Report + receipt', desc: 'Evidence-backed report and a signed, tamper-evident receipt.' },
  ] },
  { name: 'Reasoning plane · untrusted', sub: 'LangGraph agent · LLM output is never trusted', x: 40, y: 262, w: 520, h: 250, fill: '#fce4d8', stroke: C.tangerine, comps: [
    { id: 'r1', x: 60, y: 312, w: 230, label: 'Task understanding', desc: 'LLM extracts metric, magnitude, periods and the columns needed.' },
    { id: 'r2', x: 310, y: 312, w: 230, label: 'Hypothesis generator', desc: 'LLM proposes guesses; each declares the columns it will need.' },
    { id: 'r3', x: 60, y: 372, w: 230, label: 'Query writer', desc: 'LLM writes one SELECT, seeing only the columns its key covers.' },
    { id: 'r4', x: 310, y: 372, w: 230, label: 'Interpreter', desc: 'LLM explains the numbers; it cannot change the verdict.' },
    { id: 'r5', x: 60, y: 432, w: 230, label: 'Report writer', desc: 'LLM drafts the report; claims without evidence ids are deleted.' },
    { id: 'r6', x: 310, y: 432, w: 230, label: 'LLM (hosted API)', desc: 'gpt-4o-mini via LangChain, JSON-schema outputs, temperature low.' },
  ] },
  { name: 'Control plane · trusted, no LLM', sub: 'deterministic Python · every decision testable', x: 620, y: 262, w: 560, h: 250, fill: '#dcebdf', stroke: '#2e7046', comps: [
    { id: 'c1', x: 640, y: 312, w: 255, label: 'Privilege-aware planner', desc: 'Ranks guesses by plausibility × info gain ÷ (1 + λ·privilege cost).' },
    { id: 'c2', x: 905, y: 312, w: 255, label: 'Policy engine P1–P5', desc: 'Read-only, sensitivity, declaration, evidence gate, budgets.' },
    { id: 'c3', x: 640, y: 372, w: 255, label: 'Capability store (TTL)', desc: 'Mints HMAC-signed, hypothesis-bound keys; revokes on verdict.' },
    { id: 'c4', x: 905, y: 372, w: 255, label: 'Evidence engine', desc: 'Explained share, lift, z-score, onset, price/volume → verdict.' },
    { id: 'c5', x: 640, y: 432, w: 255, label: 'Injection firewall', desc: 'Masks instruction-like text in results before any LLM sees it.' },
    { id: 'c6', x: 905, y: 432, w: 255, label: 'Audit ledger + receipt', desc: 'SHA-256 hash chain of every event, sealed with HMAC.' },
  ] },
  { name: 'Execution plane', sub: 'ephemeral Docker sandbox', x: 40, y: 560, w: 330, h: 178, fill: '#e2dbd5', stroke: INK, comps: [
    { id: 'e1', x: 60, y: 608, w: 290, label: 'Python analysis (pandas, NumPy)', desc: 'Runs model-written code on released rows only.' },
    { id: 'e2', x: 60, y: 668, w: 290, label: 'no network · read-only · non-root', desc: '512 MB, 1 CPU, 64 processes, all capabilities dropped, no secrets.' },
  ] },
  { name: 'Data gateway · trusted', sub: 'the only road to the data', x: 400, y: 560, w: 360, h: 178, fill: '#f8eaa9', stroke: '#8a6d1f', comps: [
    { id: 'g1', x: 420, y: 608, w: 320, label: 'SQL → AST (sqlglot)', desc: 'Single SELECT only; expands *, resolves aliases, CTEs, joins, filters.' },
    { id: 'g2', x: 420, y: 650, w: 320, label: 'Column check vs active key', desc: 'Every column must be covered; confidential ones only inside COUNT().' },
    { id: 'g3', x: 420, y: 692, w: 320, label: 'Row limit · timeout · read-only', desc: '10,000 rows, 10 s, read-only connection: defence in depth.' },
  ] },
  { name: 'Data plane', sub: 'SQLite / PostgreSQL · CSV, Excel, JSON, Parquet', x: 790, y: 560, w: 390, h: 178, fill: '#f3ddd6', stroke: C.oxblood, comps: [
    { id: 'd1', x: 810, y: 608, w: 350, label: 'Business database (read-only role)', desc: 'Your tables; opened read-only, never written.' },
    { id: 'd2', x: 810, y: 650, w: 350, label: 'Catalogue: sensitivity per column', desc: 'public · internal · confidential · restricted, plus evidence gates.' },
    { id: 'd3', x: 810, y: 692, w: 350, label: 'Runs, ledgers, benchmark results', desc: 'Kept on disk so reports and receipts survive a restart.' },
  ] },
]

const FLOWS: { n: number; d: string; text: string; lit: string[] }[] = [
  { n: 1, d: 'M600,130 L600,170', text: 'You describe the change. The Studio sends it to the API.', lit: ['p1'] },
  { n: 2, d: 'M470,222 L330,262', text: 'The API starts the LangGraph agent. The LLM reads the question.', lit: ['r1'] },
  { n: 3, d: 'M560,340 L620,340', text: 'The LLM proposes guesses, each declaring its columns. Code ranks them, least sensitive first.', lit: ['r2', 'c1'] },
  { n: 4, d: 'M895,340 L905,340', text: 'The policy engine checks P1–P5. No LLM takes part.', lit: ['c2'] },
  { n: 5, d: 'M640,400 L560,400', text: 'ALLOW: a signed key for a few columns, for minutes. The query writer sees only those.', lit: ['c3', 'r3'] },
  { n: 6, d: 'M175,512 L175,540 L580,540 L580,560', text: 'The SQL and its key go to the gateway, the only road to data.', lit: ['g1', 'g2'] },
  { n: 7, d: 'M760,630 L790,630', text: 'Every column checked; the query runs read-only with a row limit.', lit: ['g3', 'd1'] },
  { n: 8, d: 'M720,560 L720,500 L768,500 L768,468', text: 'Rows come back; the firewall masks hidden instructions.', lit: ['c5'] },
  { n: 9, d: 'M1032,406 L1032,419 L768,419 L768,407', text: 'The evidence engine computes the verdict, then the key is destroyed.', lit: ['c4', 'c3'] },
  { n: 10, d: 'M400,690 L370,690', text: 'Optional: released rows go to the sandbox for extra analysis, with no network.', lit: ['e1'] },
  { n: 11, d: 'M1030,262 L1030,222 L730,222 L730,130', text: 'Every event is chained into the ledger and streamed to the Studio live.', lit: ['c6', 'p2', 'p3', 'p4', 'p5'] },
]

export function PlaneDiagram() {
  const [step, setStep] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [pick, setPick] = useState<Comp | null>(null)
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => setStep(s => {
      const next = (s ?? 0) + 1
      if (next > FLOWS.length) { setPlaying(false); return null }
      return next
    }), 2200)
    return () => clearInterval(id)
  }, [playing])
  const flow = step ? FLOWS[step - 1] : null
  const lit = new Set(flow?.lit ?? [])
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button onClick={() => { setStep(1); setPlaying(true); setPick(null) }}
          className="flex h-10 items-center gap-2 rounded-[10px] bg-ink px-4 font-label text-[11px] font-bold uppercase tracking-[0.08em] text-paper shadow-[0_3px_0_var(--color-oxblood)] hover:bg-oxblood">
          {playing ? 'Playing…' : '▶ Play one request'}
        </button>
        <div className="flex flex-wrap gap-1">
          {FLOWS.map(f => (
            <button key={f.n} onClick={() => { setPlaying(false); setStep(f.n) }}
              className={clsx('h-8 w-8 rounded-full font-label text-[11px] font-bold transition', step === f.n ? 'bg-mustard text-ink' : 'bg-sunken text-muted hover:bg-blush')}>{f.n}</button>
          ))}
        </div>
      </div>
      <div className="min-h-[48px] rounded-[12px] bg-ink px-4 py-3 font-mono text-[13px] text-paper">
        {flow ? <><span className="text-mustard">{flow.n}.</span> {flow.text}</> : pick ? <><span className="text-mustard">{pick.label}:</span> {pick.desc}</>
          : 'Press play to follow one request through the system, or click any box to see what it does.'}
      </div>
      <div className="mt-3 overflow-x-auto">
        <svg viewBox="0 0 1200 760" className="min-w-[900px]" style={{ width: '100%', height: 'auto', ...FONT }} role="img" aria-label="Four-plane architecture">
          <Arrowheads id="pl" />
          {/* backend bar */}
          <rect x={330} y={170} width={540} height={52} rx={10} fill={C.ink} />
          <text x={600} y={193} textAnchor="middle" fontSize={13} fontWeight={700} fill={C.paper}>FastAPI backend</text>
          <text x={600} y={211} textAnchor="middle" fontSize={10.5} fill={C.blush}>REST · server-sent events · security middleware · run state</text>
          {/* untrusted zone */}
          <rect x={22} y={240} width={366} height={510} rx={14} fill="none" stroke={C.scarlet} strokeWidth={2} strokeDasharray="8 6" />
          <rect x={22} y={240} width={556} height={290} rx={14} fill="none" stroke={C.scarlet} strokeWidth={2} strokeDasharray="8 6" />
          <rect x={30} y={233} width={392} height={16} fill="#f7f4f1" />
          <text x={36} y={245} fontSize={10.5} fontWeight={700} fill={C.scarlet} letterSpacing="0.08em" fontFamily={MONO}>UNTRUSTED ZONE · LLM OUTPUT AND GENERATED CODE</text>
          {PLANES.map(p => (
            <g key={p.name}>
              <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={12} fill={p.fill} stroke={p.stroke} strokeWidth={1.6} />
              <text x={p.x + 16} y={p.y + 22} fontSize={12} fontWeight={700} fill={INK} letterSpacing="0.06em" fontFamily={MONO}>{p.name.toUpperCase()}</text>
              <text x={p.x + 16} y={p.y + 38} fontSize={10.5} fill={MUTED}>{p.sub}</text>
              {p.comps.map(c => {
                const on = lit.has(c.id) || pick?.id === c.id
                return (
                  <g key={c.id} onClick={() => { setPlaying(false); setStep(null); setPick(c) }} className="cursor-pointer">
                    <rect x={c.x} y={c.y} width={c.w} height={34} rx={8} fill={on ? C.mustard : '#fbf9f7'} stroke={on ? INK : p.stroke}
                      strokeWidth={on ? 2.2 : 1} style={{ transition: 'all .3s' }} />
                    <text x={c.x + c.w / 2} y={c.y + 21} textAnchor="middle" fontSize={11.5} fontWeight={600} fill={INK}>{c.label}</text>
                  </g>
                )
              })}
            </g>
          ))}
          {/* flows */}
          {FLOWS.map(f => {
            const active = step === f.n
            const nums = f.d.match(/-?\d+(\.\d+)?/g)!.map(Number)
            return (
              <g key={f.n} opacity={step && !active ? 0.25 : 1}>
                <path d={f.d} fill="none" stroke={active ? C.scarlet : INK} strokeWidth={active ? 3 : 1.6}
                  markerEnd={`url(#pl-${active ? 'red' : 'solid'})`} strokeDasharray={active ? '7 5' : undefined}
                  className={active ? 'animate-[dash_.8s_linear_infinite]' : undefined} />
                <g transform={`translate(${(nums[0] + nums[2]) / 2 + 12},${(nums[1] + nums[3]) / 2})`}>
                  <circle r={10} fill={active ? C.scarlet : C.paper} stroke={active ? C.scarlet : INK} strokeWidth={1.4} />
                  <text textAnchor="middle" y={4} fontSize={10.5} fontWeight={700} fill={active ? C.paper : INK} fontFamily={MONO}>{f.n}</text>
                </g>
                {active && <circle r={7} fill={C.mustard} stroke={INK} strokeWidth={1.5}><animateMotion dur="1.4s" repeatCount="indefinite" path={f.d} /></circle>}
              </g>
            )
          })}
        </svg>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 font-label text-[9.5px] font-bold uppercase tracking-[0.08em] text-muted">
        <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded-[3px] border-2 border-dashed border-scarlet" />Trust boundary</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded-[3px] border border-tangerine bg-[#fce4d8]" />Untrusted (LLM)</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded-[3px] border border-good bg-[#dcebdf]" />Trusted code</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded-[3px] border border-[#8a6d1f] bg-[#f8eaa9]" />Gateway</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded-[3px] border border-oxblood bg-[#f3ddd6]" />Data</span>
        <span className="flex items-center gap-1.5"><svg width="24" height="8"><path d="M0,4 L18,4" stroke={INK} strokeWidth="1.6" /><path d="M16,0 L24,4 L16,8z" fill={INK} /></svg>Request flow (numbered)</span>
      </div>
    </div>
  )
}

/* ======================================================================= UML state machine */

function State({ x, y, w = 160, h = 46, name, sub, fill = '#fbf9f7', stroke = INK, llm }: { x: number; y: number; w?: number; h?: number; name: string; sub?: string; fill?: string; stroke?: string; llm?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={14} fill={llm ? '#fce4d8' : fill} stroke={llm ? C.tangerine : stroke} strokeWidth={1.6} />
      {sub ? <>
        <text x={x + w / 2} y={y + 19} textAnchor="middle" fontSize={12} fontWeight={700} fill={INK}>{name}</text>
        <line x1={x} x2={x + w} y1={y + 26} y2={y + 26} stroke={llm ? C.tangerine : stroke} strokeWidth={0.8} />
        <text x={x + w / 2} y={y + 39} textAnchor="middle" fontSize={9.5} fill={MUTED} fontStyle="italic">{sub}</text>
      </> : <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill={INK}>{name}</text>}
    </g>
  )
}
const Choice = ({ x, y }: { x: number; y: number }) => <path d={`M${x},${y - 14} L${x + 14},${y} L${x},${y + 14} L${x - 14},${y} Z`} fill="#fbf9f7" stroke={INK} strokeWidth={1.6} />
const Initial = ({ x, y }: { x: number; y: number }) => <circle cx={x} cy={y} r={9} fill={INK} />
const Final = ({ x, y }: { x: number; y: number }) => <g><circle cx={x} cy={y} r={12} fill="none" stroke={INK} strokeWidth={1.6} /><circle cx={x} cy={y} r={7} fill={INK} /></g>

function T({ d, label, at, id, red }: { d: string; label?: string; at?: [number, number]; id: string; red?: boolean }) {
  return (
    <g>
      <path d={d} fill="none" stroke={red ? C.scarlet : INK} strokeWidth={1.4} markerEnd={`url(#${id}-${red ? 'red' : 'open'})`} />
      {label && at && <text x={at[0]} y={at[1]} fontSize={10.5} fill={red ? C.scarlet : INK} fontFamily={MONO} style={{ paintOrder: 'stroke' }} stroke="#f7f4f1" strokeWidth={4}>{label}</text>}
    </g>
  )
}

export function StateMachine() {
  const id = 'sm'
  return (
    <div className="overflow-x-auto">
      <svg viewBox="0 0 1200 560" className="min-w-[900px]" style={{ width: '100%', height: 'auto', ...FONT }} role="img" aria-label="UML state machine of the investigation">
        <Arrowheads id={id} />
        <text x={14} y={22} fontSize={11} fontWeight={700} fill={INK} fontFamily={MONO}>stm Investigation</text>
        <rect x={6} y={6} width={1188} height={548} rx={16} fill="none" stroke={INK} strokeWidth={1} />
        <Initial x={50} y={95} />
        <T id={id} d="M59,95 L96,95" />
        <State x={96} y={72} name="Understand" sub="entry / LLM: metric, periods" llm />
        <T id={id} d="M256,95 L310,95" label="[change]" at={[262, 85]} />
        <State x={310} y={72} name="Hypothesize" sub="LLM proposes · code sweeps" llm />
        <T id={id} d="M470,95 L524,95" />
        <State x={524} y={72} name="Plan" sub="do / rank by priority" />
        <T id={id} d="M684,95 L762,95" />
        <Choice x={776} y={95} />
        <T id={id} d="M790,95 L900,95" label="[stop rule met]" at={[796, 85]} />
        <State x={900} y={72} name="Report" sub="entry / revoke all keys" llm />
        <T id={id} d="M1060,95 L1118,95" />
        <Final x={1132} y={95} />
        <T id={id} d="M776,109 L776,180" label="[next guess]" at={[784, 150]} />
        <State x={696} y={180} name="RequestCapability" sub="policy P1–P5 (no LLM)" w={180} />
        <T id={id} d="M786,226 L786,268" />
        <Choice x={786} y={282} />
        <T id={id} d="M772,282 L604,282 L604,118" label="[DENY] / log security event" at={[612, 274]} red />
        <T id={id} d="M786,296 L786,348" label="[ALLOW] / mint key" at={[794, 326]} />
        <State x={706} y={348} name="WriteQuery" sub="LLM sees granted columns" llm />
        <T id={id} d="M706,371 L560,371" />
        <State x={400} y={348} name="Execute" sub="gateway: AST check, read-only" />
        <T id={id} d="M400,371 L326,371" />
        <Choice x={312} y={371} />
        <T id={id} d="M298,371 L230,371 L230,430" label="[ok]" at={[248, 364]} />
        <T id={id} d="M312,385 L312,470 L866,470 L866,394" label="[error ∧ attempts < 3] / feed error back" at={[420, 462]} red />
        <T id={id} d="M312,357 L312,200 L290,200" label="[3 failures] / INCONCLUSIVE" at={[318, 250]} />
        <State x={150} y={430} name="Interpret" sub="evidence engine decides verdict" w={170} />
        <T id={id} d="M235,476 L235,520 L60,520 L60,190 L130,190" />
        <State x={130} y={168} name="Revoke" sub="exit / destroy key" />
        <T id={id} d="M210,168 L210,140 L560,140 L560,118" label="/ hypothesis → SUPPORTED · REJECTED · INCONCLUSIVE" at={[250, 134]} />
        <T id={id} d="M176,72 L176,40 L1000,40 L1000,72" label="[lookup question] / answer directly, no investigation" at={[330, 34]} />
        <g transform="translate(910,420)">
          <rect width={270} height={118} rx={10} fill="#fbf9f7" stroke={MUTED} strokeDasharray="4 3" />
          <text x={12} y={20} fontSize={10.5} fontWeight={700} fill={INK} fontFamily={MONO}>NOTATION (UML 2.5)</text>
          <Initial x={22} y={40} /><text x={38} y={44} fontSize={10.5} fill={INK}>initial pseudo-state</text>
          <Final x={150} y={40} /><text x={168} y={44} fontSize={10.5} fill={INK}>final state</text>
          <Choice x={22} y={68} /><text x={42} y={72} fontSize={10.5} fill={INK}>choice: [guard]</text>
          <rect x={150} y={60} width={22} height={16} rx={5} fill="#fce4d8" stroke={C.tangerine} /><text x={178} y={72} fontSize={10.5} fill={INK}>LLM state</text>
          <text x={12} y={100} fontSize={10.5} fill={INK}>trigger [guard] / effect · red = denial path</text>
        </g>
      </svg>
    </div>
  )
}

export function Lifecycle() {
  const id = 'lc'
  return (
    <svg viewBox="0 0 760 300" style={{ width: '100%', height: 'auto', ...FONT }} role="img" aria-label="UML state machine of one hypothesis">
      <Arrowheads id={id} />
      <rect x={4} y={4} width={752} height={292} rx={14} fill="none" stroke={INK} />
      <text x={14} y={22} fontSize={11} fontWeight={700} fill={INK} fontFamily={MONO}>stm Hypothesis</text>
      <Initial x={40} y={150} />
      <T id={id} d="M49,150 L80,150" label="proposed" at={[44, 140]} />
      <State x={80} y={127} w={130} name="PROPOSED" />
      <T id={id} d="M210,150 L290,150" label="[ALLOW]" at={[220, 142]} />
      <State x={290} y={127} w={130} name="TESTING" fill={C.ink} />
      <text x={355} y={155} textAnchor="middle" fontSize={12} fontWeight={700} fill={C.paper}>TESTING</text>
      <T id={id} d="M145,173 L145,230" label="[DENY]" at={[152, 205]} red />
      <State x={80} y={230} w={130} name="BLOCKED" fill="#f3ddd6" stroke={C.oxblood} />
      <T id={id} d="M210,245 L250,245 L250,120 L210,120 L180,127" label="[P4: finding now exists] retry once" at={[258, 200]} />
      {[['SUPPORTED', 60, '#dcebdf', 'E≥0.4 ∧ lift≥1.5'], ['INCONCLUSIVE', 150, '#f8eaa9', 'otherwise'], ['REJECTED', 240, '#f8dcd6', 'E<0.15']].map(([n, y, f, g]) => (
        <g key={n as string}>
          <T id={id} d={`M420,150 L520,${(y as number) - 10 + 23}`} label={`[${g}]`} at={[426, (y as number) - 18 + 23 + ((y as number) < 150 ? -8 : (y as number) > 150 ? 20 : -6)]} />
          <State x={520} y={(y as number) - 10} w={150} name={n as string} fill={f as string} />
          <T id={id} d={`M670,${(y as number) + 13} L712,${(y as number) + 13}`} />
          <Final x={724} y={(y as number) + 13} />
        </g>
      ))}
    </svg>
  )
}

/* ======================================================================= UML sequence */

const LIFE = ['Analyst', 'Agent Studio', 'API', 'Agent (LLM)', 'Policy engine', 'Capability store', 'SQL gateway', 'Database', 'Evidence engine']
type Msg = { a: number; b: number; text: string; ret?: boolean; self?: boolean; frag?: 'ALLOW' | 'DENY' }
const MSGS: Msg[] = [
  { a: 0, b: 1, text: 'describe change, pick System C' },
  { a: 1, b: 2, text: 'POST /api/investigations' },
  { a: 2, b: 3, text: 'run(problem)' },
  { a: 3, b: 3, text: 'propose hypotheses + columns', self: true },
  { a: 3, b: 4, text: 'request(h, columns, purpose, ttl)' },
  { a: 4, b: 5, text: 'mint signed key (TTL)', frag: 'ALLOW' },
  { a: 5, b: 3, text: 'capability token', ret: true, frag: 'ALLOW' },
  { a: 3, b: 6, text: 'SELECT … + token', frag: 'ALLOW' },
  { a: 6, b: 6, text: 'parse AST, check each column', self: true, frag: 'ALLOW' },
  { a: 6, b: 7, text: 'read-only query, row limit', frag: 'ALLOW' },
  { a: 7, b: 6, text: 'rows', ret: true, frag: 'ALLOW' },
  { a: 6, b: 3, text: 'rows (instructions masked)', ret: true, frag: 'ALLOW' },
  { a: 3, b: 8, text: 'score(result)', frag: 'ALLOW' },
  { a: 8, b: 3, text: 'SUPPORTED / REJECTED', ret: true, frag: 'ALLOW' },
  { a: 3, b: 5, text: 'revoke key', frag: 'ALLOW' },
  { a: 4, b: 3, text: 'DENY + reason (logged)', ret: true, frag: 'DENY' },
  { a: 2, b: 1, text: 'events (server-sent, live)', ret: true },
  { a: 1, b: 0, text: 'report + signed receipt', ret: true },
]

export function Sequence() {
  const [ref, on] = useVisible<HTMLDivElement>()
  const [k, setK] = useState(0)
  useEffect(() => { if (on) setK(1) }, [on])
  const id = 'sq'
  const X = (i: number) => 70 + i * 132
  const Y0 = 70, DY = 34
  const allowStart = Y0 + 5 * DY + 12, allowEnd = Y0 + 15 * DY - 14, denyEnd = Y0 + 16 * DY - 10
  return (
    <div ref={ref}>
      <button onClick={() => setK(x => x + 1)} className="mb-3 font-label text-[11px] font-bold uppercase tracking-[0.08em] text-ink underline underline-offset-4 hover:text-oxblood">↻ Replay</button>
      <div className="overflow-x-auto">
        <svg key={k} viewBox="0 0 1200 760" className="min-w-[900px]" style={{ width: '100%', height: 'auto', ...FONT }} role="img" aria-label="UML sequence diagram">
          <Arrowheads id={id} />
          <text x={14} y={20} fontSize={11} fontWeight={700} fill={INK} fontFamily={MONO}>sd TestOneHypothesis</text>
          <rect x={4} y={4} width={1192} height={752} rx={12} fill="none" stroke={INK} />
          {LIFE.map((l, i) => (
            <g key={l}>
              <rect x={X(i) - 58} y={30} width={116} height={30} rx={6} fill={i === 3 ? '#fce4d8' : i === 0 ? C.ink : '#fbf9f7'} stroke={i === 3 ? C.tangerine : INK} />
              <text x={X(i)} y={50} textAnchor="middle" fontSize={11} fontWeight={700} fill={i === 0 ? C.paper : INK}>{l}</text>
              <line x1={X(i)} x2={X(i)} y1={60} y2={740} stroke={MUTED} strokeDasharray="5 5" />
            </g>
          ))}
          {/* activation bars */}
          <rect x={X(3) - 5} y={Y0 + 2 * DY - 4} width={10} height={14 * DY} fill="#fce4d8" stroke={C.tangerine} />
          <rect x={X(6) - 5} y={Y0 + 7 * DY - 4} width={10} height={5 * DY} fill="#f8eaa9" stroke="#8a6d1f" />
          {/* alt fragment */}
          <rect x={X(3) - 40} y={allowStart} width={X(8) - X(3) + 90} height={denyEnd - allowStart} fill="none" stroke={INK} strokeWidth={1.2} />
          <path d={`M${X(3) - 40},${allowStart} h46 v14 l-8,8 h-38 z`} fill={C.ink} />
          <text x={X(3) - 32} y={allowStart + 15} fontSize={10.5} fontWeight={700} fill={C.paper} fontFamily={MONO}>alt</text>
          <text x={X(3) + 14} y={allowStart + 15} fontSize={10.5} fill="#2e7046" fontFamily={MONO}>[policy ALLOW]</text>
          <line x1={X(3) - 40} x2={X(8) + 50} y1={allowEnd} y2={allowEnd} stroke={INK} strokeDasharray="6 4" />
          <text x={X(3) - 32} y={allowEnd + 14} fontSize={10.5} fill={C.scarlet} fontFamily={MONO}>[policy DENY]</text>
          {MSGS.map((m, i) => {
            const y = Y0 + (i + 1) * DY + (m.frag === 'DENY' ? 6 : i > 15 ? 14 : 0)
            const delay = `${0.25 + i * 0.18}s`
            const red = m.frag === 'DENY'
            const stroke = red ? C.scarlet : INK
            if (m.self) {
              return (
                <g key={i} style={{ animation: `fade-in .45s ${delay} both` }}>
                  <path d={`M${X(m.a) + 5},${y - 8} h38 v16 h-36`} fill="none" stroke={stroke} strokeWidth={1.3} markerEnd={`url(#${id}-solid)`} />
                  <text x={X(m.a) + 50} y={y + 4} fontSize={10.5} fill={INK}>{i + 1}: {m.text}</text>
                </g>
              )
            }
            const x1 = X(m.a) + (m.b > m.a ? 5 : -5), x2 = X(m.b) + (m.b > m.a ? -5 : 5)
            return (
              <g key={i} style={{ animation: `fade-in .45s ${delay} both` }}>
                <line x1={x1} x2={x2} y1={y} y2={y} stroke={stroke} strokeWidth={1.3} strokeDasharray={m.ret ? '6 4' : undefined}
                  markerEnd={`url(#${id}-${m.ret ? 'open' : red ? 'red' : 'solid'})`} />
                <text x={(x1 + x2) / 2} y={y - 6} textAnchor="middle" fontSize={10.5} fill={red ? C.scarlet : INK}
                  style={{ paintOrder: 'stroke' }} stroke="#f7f4f1" strokeWidth={4}>{i + 1}: {m.text}</text>
              </g>
            )
          })}
          <g transform="translate(20,700)">
            <line x1={0} x2={40} y1={8} y2={8} stroke={INK} markerEnd={`url(#${id}-solid)`} /><text x={48} y={12} fontSize={10.5} fill={INK}>synchronous call</text>
            <line x1={170} x2={210} y1={8} y2={8} stroke={INK} strokeDasharray="6 4" markerEnd={`url(#${id}-open)`} /><text x={218} y={12} fontSize={10.5} fill={INK}>reply</text>
            <rect x={280} y={0} width={10} height={16} fill="#fce4d8" stroke={C.tangerine} /><text x={298} y={12} fontSize={10.5} fill={INK}>activation (LLM)</text>
          </g>
        </svg>
      </div>
    </div>
  )
}

/* ======================================================================= UML deployment */

function Node3D({ x, y, w, h, stereo, name, children, fill = '#fbf9f7' }: { x: number; y: number; w: number; h: number; stereo: string; name: string; children?: ReactNode; fill?: string }) {
  const d = 12
  return (
    <g>
      <path d={`M${x},${y} l${d},${-d} h${w} v${h} l${-d},${d}`} fill="#e2dbd5" stroke={INK} strokeWidth={1.3} />
      <line x1={x + w} y1={y} x2={x + w + d} y2={y - d} stroke={INK} strokeWidth={1.3} />
      <rect x={x} y={y} width={w} height={h} fill={fill} stroke={INK} strokeWidth={1.3} />
      <text x={x + w / 2} y={y + 18} textAnchor="middle" fontSize={10} fill={MUTED} fontStyle="italic">«{stereo}»</text>
      <text x={x + w / 2} y={y + 33} textAnchor="middle" fontSize={12} fontWeight={700} fill={INK}>{name}</text>
      {children}
    </g>
  )
}
function Artifact({ x, y, w, name }: { x: number; y: number; w: number; name: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={30} fill="#fff" stroke={INK} strokeWidth={1} />
      <path d={`M${x + w - 16},${y + 5} h8 l4,4 v12 h-12 z`} fill="none" stroke={INK} strokeWidth={0.9} />
      <text x={x + 10} y={y + 19} fontSize={10.5} fill={INK}>«artifact» {name}</text>
    </g>
  )
}

export function Deployment() {
  const id = 'dp'
  const path = (d: string, label: string, at: [number, number]) => (
    <g><path d={d} fill="none" stroke={INK} strokeWidth={1.4} />
      <text x={at[0]} y={at[1]} fontSize={10.5} fill={INK} fontFamily={MONO} style={{ paintOrder: 'stroke' }} stroke="#f7f4f1" strokeWidth={4}>{label}</text></g>
  )
  return (
    <div className="overflow-x-auto">
      <svg viewBox="0 0 1200 560" className="min-w-[900px]" style={{ width: '100%', height: 'auto', ...FONT }} role="img" aria-label="UML deployment diagram">
        <Arrowheads id={id} />
        <text x={14} y={22} fontSize={11} fontWeight={700} fill={INK} fontFamily={MONO}>deployment InvestiGuard (single machine)</text>
        {path('M250,190 L330,190', 'HTTP + SSE · localhost', [236, 180])}
        {path('M760,240 L840,240', 'docker run · --network none', [740, 230])}
        {path('M590,420 L590,470', 'SQLAlchemy · read-only', [600, 452])}
        {path('M760,150 L960,90', 'HTTPS · JSON schema', [810, 108])}
        <Node3D x={30} y={110} w={220} h={190} stereo="device" name="Analyst laptop">
          <Node3D x={50} y={160} w={180} h={120} stereo="executionEnvironment" name="Web browser" fill="#efeae6">
            <Artifact x={60} y={220} w={160} name="React SPA" />
          </Node3D>
        </Node3D>
        <Node3D x={330} y={60} w={430} h={360} stereo="device" name="Host machine (macOS / Linux)">
          <Node3D x={350} y={110} w={390} h={290} stereo="executionEnvironment" name="Python 3.12 · uvicorn" fill="#dcebdf">
            <Artifact x={366} y={170} w={170} name="FastAPI app" />
            <Artifact x={552} y={170} w={172} name="LangGraph agent" />
            <Artifact x={366} y={212} w={170} name="policy engine" />
            <Artifact x={552} y={212} w={172} name="SQL gateway" />
            <Artifact x={366} y={254} w={170} name="evidence engine" />
            <Artifact x={552} y={254} w={172} name="ledger" />
            <Artifact x={366} y={296} w={358} name="security middleware (CSP, CSRF, rate limits)" />
            <text x={545} y={360} textAnchor="middle" fontSize={10} fill={MUTED}>{'{signing key: data/.signing_key, mode 0600}'}</text>
          </Node3D>
        </Node3D>
        <Node3D x={840} y={180} w={330} h={200} stereo="executionEnvironment" name="Docker Engine" fill="#e2dbd5">
          <Node3D x={860} y={232} w={290} h={130} stereo="container" name="sandbox · python:3.12-slim" fill="#fbf9f7">
            <text x={1005} y={290} textAnchor="middle" fontSize={10.5} fill={INK}>{'{network = none, read-only,'}</text>
            <text x={1005} y={306} textAnchor="middle" fontSize={10.5} fill={INK}>{'user = 10001, mem = 512m, pids = 64}'}</text>
            <Artifact x={880} y={320} w={250} name="runner.py + analysis code" />
          </Node3D>
        </Node3D>
        <Node3D x={420} y={470} w={340} h={74} stereo="database" name="SQLite / PostgreSQL" fill="#f3ddd6">
          <text x={590} y={530} textAnchor="middle" fontSize={10.5} fill={INK}>{'{role = read-only}'}</text>
        </Node3D>
        <Node3D x={960} y={40} w={210} h={80} stereo="cloud service" name="OpenAI API" fill="#fce4d8">
          <text x={1065} y={100} textAnchor="middle" fontSize={10.5} fill={MUTED}>untrusted output</text>
        </Node3D>
      </svg>
    </div>
  )
}
