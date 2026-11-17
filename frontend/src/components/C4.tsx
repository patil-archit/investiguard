/**
 * System architecture in C4 model notation (Simon Brown): Level 1 system context, Level 2 containers,
 * Level 3 components of the API application. Hand-laid-out SVG so every box, boundary and relationship
 * sits exactly where it should; arrows point from the element that depends to the element it uses.
 */
import type { ReactNode } from 'react'

type Kind = 'person' | 'system' | 'container' | 'component' | 'untrusted' | 'external' | 'db' | 'extdb'
type Pt = [number, number]

interface Node { x: number; y: number; w: number; h: number; kind: Kind; name: string; tech: string; desc: string }
interface Edge { pts: Pt[]; label: string[]; at: Pt }
interface Boundary { x: number; y: number; w: number; h: number; name: string; tech?: string; trust?: boolean }
interface Diagram { level: string; title: string; caption: string; size: Pt; boundaries: Boundary[]; nodes: Node[]; edges: Edge[] }

const STYLE: Record<Kind, { fill: string; stroke: string; text: string; sub: string }> = {
  person: { fill: '#2D2A26', stroke: '#151311', text: '#F7F4F1', sub: '#D9CFC7' },
  system: { fill: '#8B231A', stroke: '#6E1A13', text: '#F7F4F1', sub: '#F3D3CB' },
  container: { fill: '#B8392E', stroke: '#8B231A', text: '#F7F4F1', sub: '#F8DCD6' },
  db: { fill: '#B8392E', stroke: '#8B231A', text: '#F7F4F1', sub: '#F8DCD6' },
  component: { fill: '#F6E3DD', stroke: '#D9A194', text: '#2D2A26', sub: '#7A3A30' },
  untrusted: { fill: '#fdf3e6', stroke: '#c48a3f', text: '#5a3a12', sub: '#8a5a1c' },
  external: { fill: '#8f8b83', stroke: '#77736b', text: '#F7F4F1', sub: '#efeeeb' },
  extdb: { fill: '#8f8b83', stroke: '#77736b', text: '#F7F4F1', sub: '#efeeeb' },
}
const LINE = '#776C63'

// ---------------------------------------------------------------- Level 1
const CONTEXT: Diagram = {
  level: 'Level 1', title: 'System context', size: [1000, 560],
  caption: 'InvestiGuard as one box: who uses it and which outside systems it depends on.',
  boundaries: [],
  nodes: [
    { x: 380, y: 20, w: 240, h: 140, kind: 'person', name: 'Analyst', tech: '[Person]',
      desc: 'Wants to know why a business number changed; asks questions about the data.' },
    { x: 350, y: 250, w: 300, h: 120, kind: 'system', name: 'InvestiGuard', tech: '[Software System]',
      desc: 'Least-privilege analytics agent: finds root causes while reading only the columns each test needs.' },
    { x: 40, y: 430, w: 260, h: 110, kind: 'external', name: 'OpenAI API', tech: '[Software System, external]',
      desc: 'Large language model (gpt-4o-mini). Everything it returns is treated as untrusted.' },
    { x: 700, y: 430, w: 260, h: 110, kind: 'extdb', name: 'Business data', tech: '[Software System, external]',
      desc: 'Uploaded files, or a PostgreSQL / MySQL / SQLite database.' },
  ],
  edges: [
    { pts: [[500, 160], [500, 250]], label: ['Runs investigations, asks questions', '[HTTPS]'], at: [500, 205] },
    { pts: [[350, 330], [170, 330], [170, 430]], label: ['Prompts with schema and results', '[HTTPS, JSON]'], at: [170, 383] },
    { pts: [[650, 330], [830, 330], [830, 430]], label: ['Reads approved columns only', '[SQL, read-only]'], at: [830, 383] },
  ],
}

// ---------------------------------------------------------------- Level 2
const CONTAINERS: Diagram = {
  level: 'Level 2', title: 'Containers', size: [1100, 780],
  caption: 'Zooms into InvestiGuard: the separately running or stored parts and how they talk.',
  boundaries: [{ x: 150, y: 180, w: 800, h: 420, name: 'InvestiGuard', tech: '[Software System]' }],
  // The code sandbox sits inside the system but is drawn with no arrow out: it has no network at all.
  nodes: [
    { x: 430, y: 10, w: 240, h: 130, kind: 'person', name: 'Analyst', tech: '[Person]', desc: 'Uses the web app in a browser.' },
    { x: 410, y: 215, w: 280, h: 110, kind: 'container', name: 'Web application', tech: '[Container: React, TypeScript, Tailwind]',
      desc: 'Investigate, Ask, Compare and Data pages; draws the live timeline.' },
    { x: 410, y: 420, w: 280, h: 125, kind: 'container', name: 'API application', tech: '[Container: Python, FastAPI, LangGraph]',
      desc: 'Runs investigations and questions; enforces policy, capabilities and the SQL gateway.' },
    { x: 180, y: 215, w: 190, h: 110, kind: 'db', name: 'Catalogue', tech: '[Container: YAML files]',
      desc: 'Sensitivity labels, evidence gates, dataset registry.' },
    { x: 730, y: 215, w: 190, h: 110, kind: 'db', name: 'Dataset store', tech: '[Container: SQLite, read-only]',
      desc: 'Uploaded CSV, Excel, JSON or Parquet, cleaned into tables.' },
    { x: 740, y: 440, w: 190, h: 110, kind: 'untrusted', name: 'Code sandbox', tech: '[Container: Docker, no network]',
      desc: 'Runs LLM-written Python on released rows only.' },
    { x: 40, y: 650, w: 260, h: 110, kind: 'external', name: 'OpenAI API', tech: '[Software System, external]',
      desc: 'Language model; output is untrusted.' },
    { x: 800, y: 650, w: 260, h: 110, kind: 'extdb', name: 'External database', tech: '[Software System, external]',
      desc: 'PostgreSQL or MySQL, reached with a read-only account.' },
  ],
  edges: [
    { pts: [[550, 140], [550, 215]], label: ['Uses', '[HTTPS]'], at: [550, 178] },
    { pts: [[550, 325], [550, 420]], label: ['Starts runs, asks questions, streams events', '[JSON/HTTPS, SSE]'], at: [550, 372] },
    { pts: [[410, 480], [275, 480], [275, 325]], label: ['Loads and saves labels', '[YAML]'], at: [275, 402] },
    { pts: [[690, 455], [710, 455], [710, 380], [825, 380], [825, 325]], label: ['Runs checked SELECTs', '[SQLAlchemy, read-only]'], at: [800, 380] },
    { pts: [[690, 510], [740, 510]], label: ['Rows', '+ code'], at: [715, 510] },
    { pts: [[470, 545], [470, 705], [300, 705]], label: ['Structured prompts', '[HTTPS, JSON]'], at: [385, 705] },
    { pts: [[630, 545], [630, 705], [800, 705]], label: ['Runs checked SELECTs', '[SQL, read-only account]'], at: [715, 705] },
  ],
}

// ---------------------------------------------------------------- Level 3
const COMPONENTS: Diagram = {
  level: 'Level 3', title: 'Components of the API application', size: [1340, 1010],
  caption: 'Zooms into the API application. The LLM client (inside the red trust boundary) and the code sandbox are the only untrusted parts.',
  boundaries: [
    { x: 230, y: 150, w: 1085, h: 700, name: 'API application', tech: '[Container: Python, FastAPI]' },
    { x: 640, y: 328, w: 280, h: 150, name: 'Untrusted · LLM output', trust: true },
  ],
  nodes: [
    { x: 650, y: 10, w: 260, h: 100, kind: 'container', name: 'Web application', tech: '[Container: React, TypeScript]',
      desc: 'Single-page app in the browser.' },
    { x: 1060, y: 10, w: 230, h: 100, kind: 'db', name: 'Catalogue', tech: '[Container: YAML files]',
      desc: 'Sensitivity labels and evidence gates.' },
    { x: 10, y: 260, w: 200, h: 110, kind: 'external', name: 'OpenAI API', tech: '[Software System, external]',
      desc: 'Returns structured JSON.' },
    { x: 660, y: 900, w: 240, h: 100, kind: 'db', name: 'Dataset store', tech: '[Container: SQLite / SQL database]',
      desc: 'Opened read-only.' },
    { x: 1020, y: 900, w: 240, h: 100, kind: 'untrusted', name: 'Code sandbox', tech: '[Container: Docker, no network]',
      desc: 'Runs LLM-written Python; nothing can leave it.' },

    { x: 660, y: 190, w: 240, h: 100, kind: 'component', name: 'API endpoints', tech: '[Component: FastAPI, SSE]',
      desc: 'REST routes; background runs, live events, analyst approvals.' },
    { x: 300, y: 360, w: 240, h: 100, kind: 'component', name: 'Investigation orchestrator', tech: '[Component: LangGraph StateGraph]',
      desc: 'Runs the loop; every routing edge is a plain function of state.' },
    { x: 660, y: 360, w: 240, h: 100, kind: 'untrusted', name: 'LLM client', tech: '[Component: LangChain, structured output]',
      desc: 'Writes objectives, hypotheses, SQL and reports.' },
    { x: 1020, y: 360, w: 240, h: 100, kind: 'component', name: 'Ask-your-data service', tech: '[Component: Python]',
      desc: 'One question, one checked query, one plain answer.' },
    { x: 300, y: 530, w: 240, h: 100, kind: 'component', name: 'Planner', tech: '[Component: Python]',
      desc: 'Ranks hypotheses: plausibility × gain ÷ privilege cost.' },
    { x: 660, y: 530, w: 240, h: 100, kind: 'component', name: 'Policy & capabilities', tech: '[Component: Python, PyJWT]',
      desc: 'P1–P5 allow/deny; mints, verifies and revokes signed tokens.' },
    { x: 300, y: 700, w: 240, h: 100, kind: 'component', name: 'Evidence engine', tech: '[Component: Python, pandas]',
      desc: 'Share, lift, significance, price vs volume, onset; decides verdicts.' },
    { x: 1020, y: 530, w: 240, h: 100, kind: 'component', name: 'Injection firewall', tech: '[Component: Python, regex]',
      desc: 'Masks instruction-like cells before any LLM sees a result.' },
    { x: 1020, y: 700, w: 240, h: 100, kind: 'component', name: 'Access ledger', tech: '[Component: SHA-256 chain, HMAC]',
      desc: 'Hash-chains every event; seals a verifiable receipt.' },
    { x: 660, y: 700, w: 240, h: 100, kind: 'component', name: 'SQL gateway', tech: '[Component: sqlglot, SQLAlchemy]',
      desc: 'Checks every column via the syntax tree; row limit; fails closed.' },
  ],
  edges: [
    { pts: [[780, 110], [780, 190]], label: ['Calls API, streams events', '[JSON/HTTPS, SSE]'], at: [780, 132] },
    { pts: [[900, 215], [1175, 215], [1175, 110]], label: ['Loads and saves labels', '[YAML]'], at: [1040, 215] },
    { pts: [[660, 250], [420, 250], [420, 360]], label: ['Starts investigation'], at: [540, 250] },
    { pts: [[900, 258], [1100, 258], [1100, 360]], label: ['Forwards question'], at: [1000, 258] },
    { pts: [[720, 360], [720, 315], [210, 315]], label: ['Prompts', '[HTTPS, JSON]'], at: [290, 315] },
    { pts: [[540, 410], [660, 410]], label: ['Gets', 'proposals'], at: [600, 410] },
    { pts: [[1020, 410], [900, 410]], label: ['Drafts SQL', 'and answer'], at: [960, 410] },
    { pts: [[420, 460], [420, 530]], label: ['Picks next hypothesis'], at: [420, 495] },
    { pts: [[540, 430], [620, 430], [620, 580], [660, 580]], label: ['Requests', 'capability'], at: [620, 505] },
    { pts: [[540, 452], [590, 452], [590, 750], [660, 750]], label: ['Submits', 'SQL + token'], at: [590, 665] },
    { pts: [[300, 430], [270, 430], [270, 750], [300, 750]], label: ['Scores', 'results'], at: [270, 665] },
    { pts: [[1020, 430], [940, 430], [940, 580], [900, 580]], label: ['Requests', 'capability'], at: [940, 505] },
    { pts: [[1020, 452], [970, 452], [970, 750], [900, 750]], label: ['Submits', 'SQL + token'], at: [970, 665] },
    { pts: [[780, 700], [780, 630]], label: ['Verifies token'], at: [780, 665] },
    { pts: [[780, 800], [780, 900]], label: ['Read-only SELECT', '[SQLAlchemy]'], at: [780, 875] },
    { pts: [[1200, 460], [1200, 530]], label: ['Scans rows'], at: [1200, 495] },
    { pts: [[900, 236], [1300, 236], [1300, 750], [1260, 750]], label: ['Appends every event'], at: [1230, 236] },
    { pts: [[1260, 410], [1280, 410], [1280, 950], [1260, 950]], label: ['Rows + code'], at: [1280, 875] },
  ],
}

export const C4_DIAGRAMS = [CONTEXT, CONTAINERS, COMPONENTS]

// ---------------------------------------------------------------- rendering
function Label({ x, y, w, h, n }: { x: number; y: number; w: number; h: number; n: Node }) {
  const s = STYLE[n.kind]
  return (
    <foreignObject x={x} y={y} width={w} height={h}>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', padding: '4px 10px', color: s.text, fontFamily: 'Geist, sans-serif', lineHeight: 1.25 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{n.name}</div>
        <div style={{ fontSize: 10.5, color: s.sub, marginTop: 2 }}>{n.tech}</div>
        <div style={{ fontSize: 11, marginTop: 5, opacity: 0.95 }}>{n.desc}</div>
      </div>
    </foreignObject>
  )
}

function Shape({ n }: { n: Node }) {
  const s = STYLE[n.kind]
  const common = { fill: s.fill, stroke: s.stroke, strokeWidth: 1.2 }
  if (n.kind === 'person') {
    const cx = n.x + n.w / 2
    return <g>
      <circle cx={cx} cy={n.y + 19} r={19} {...common} />
      <rect x={n.x} y={n.y + 36} width={n.w} height={n.h - 36} rx={22} {...common} />
      <Label x={n.x} y={n.y + 36} w={n.w} h={n.h - 36} n={n} />
    </g>
  }
  if (n.kind === 'db' || n.kind === 'extdb') {
    const ry = 10, { x, y, w, h } = n
    return <g>
      <path d={`M${x},${y + ry} L${x},${y + h - ry} A${w / 2},${ry} 0 0 0 ${x + w},${y + h - ry} L${x + w},${y + ry} A${w / 2},${ry} 0 0 1 ${x},${y + ry} Z`} {...common} />
      <ellipse cx={x + w / 2} cy={y + ry} rx={w / 2} ry={ry} {...common} />
      <Label x={x} y={y + 2 * ry} w={w} h={h - 2 * ry - 4} n={n} />
    </g>
  }
  return <g>
    <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={7} {...common} />
    <Label x={n.x} y={n.y} w={n.w} h={n.h} n={n} />
  </g>
}

function BoundaryBox({ b }: { b: Boundary }) {
  if (b.trust) {
    return <g>
      <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={8} fill="rgb(211 41 41 / 0.04)" stroke="#D32929" strokeWidth={1.3} strokeDasharray="5 4" />
      <text x={b.x + 9} y={b.y + 15} fontSize={10} fontWeight={600} fill="#D32929" letterSpacing="0.06em">{b.name.toUpperCase()}</text>
    </g>
  }
  return <g>
    <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={10} fill="none" stroke="#A0948A" strokeWidth={1.2} strokeDasharray="7 5" />
    <text x={b.x + 12} y={b.y + b.h - 26} fontSize={13} fontWeight={600} fill="#4B443D">{b.name}</text>
    {b.tech && <text x={b.x + 12} y={b.y + b.h - 11} fontSize={10.5} fill="#776C63">{b.tech}</text>}
  </g>
}

function EdgeLine({ e, id }: { e: Edge; id: string }) {
  const d = e.pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ')
  const [lx, ly] = e.at
  const top = ly - ((e.label.length - 1) * 13) / 2
  return <g>
    {/* white underlay so lines that cross later get a visible gap */}
    <path d={d} fill="none" stroke="#F7F4F1" strokeWidth={7} />
    <path d={d} fill="none" stroke={LINE} strokeWidth={1.3} markerEnd={`url(#${id})`} />
    <text textAnchor="middle" fontSize={11} style={{ paintOrder: 'stroke' }} stroke="#F7F4F1" strokeWidth={5} strokeLinejoin="round">
      {e.label.map((l, i) => (
        <tspan key={i} x={lx} y={top + i * 13 + 4} fill={l.startsWith('[') ? '#776C63' : '#4B443D'} fontSize={l.startsWith('[') ? 10 : 11}>{l}</tspan>
      ))}
    </text>
  </g>
}

export function C4Diagram({ d }: { d: Diagram }) {
  const id = `arrow-${d.level.replace(/\s/g, '')}`
  return (
    <figure>
      <figcaption className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="rounded bg-sunken px-1.5 py-0.5 font-mono text-[11px] text-muted">{d.level}</span>
        <span className="text-sm font-semibold text-fg">{d.title}</span>
        <span className="text-xs text-muted">{d.caption}</span>
      </figcaption>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${d.size[0]} ${d.size[1]}`} className="mx-auto block w-full min-w-[760px]" style={{ maxWidth: d.size[0] }}
          role="img" aria-label={`${d.level} ${d.title} diagram`} fontFamily="Geist, sans-serif">
          <defs>
            <marker id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={LINE} />
            </marker>
          </defs>
          {d.boundaries.filter(b => !b.trust).map(b => <BoundaryBox key={b.name} b={b} />)}
          {d.edges.map((e, i) => <EdgeLine key={i} e={e} id={id} />)}
          {d.boundaries.filter(b => b.trust).map(b => <BoundaryBox key={b.name} b={b} />)}
          {d.nodes.map(n => <Shape key={`${n.name}-${n.x}`} n={n} />)}
        </svg>
      </div>
    </figure>
  )
}

function Key({ swatch, label }: { swatch: ReactNode; label: string }) {
  return <span className="flex items-center gap-2 text-xs text-muted"><span className="flex h-4 w-6 items-center justify-center">{swatch}</span>{label}</span>
}

export function C4Key() {
  const box = (k: Kind) => <span className="h-3.5 w-5 rounded-[3px] border" style={{ background: STYLE[k].fill, borderColor: STYLE[k].stroke }} />
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2">
      <Key swatch={<span className="h-3.5 w-3.5 rounded-full" style={{ background: STYLE.person.fill }} />} label="Person" />
      <Key swatch={box('system')} label="Software system" />
      <Key swatch={box('container')} label="Container" />
      <Key swatch={box('component')} label="Component (trusted code)" />
      <Key swatch={box('untrusted')} label="Component (LLM, untrusted)" />
      <Key swatch={box('external')} label="External system" />
      <Key swatch={<svg width="18" height="16" viewBox="0 0 18 16"><path d="M1,4 L1,12 A8,3 0 0 0 17,12 L17,4 A8,3 0 0 1 1,4Z" fill={STYLE.container.fill} /><ellipse cx="9" cy="4" rx="8" ry="3" fill={STYLE.container.fill} stroke="#8B231A" strokeWidth=".8" /></svg>} label="Data store" />
      <Key swatch={<span className="h-3.5 w-5 rounded-[3px] border border-dashed border-subtle" />} label="System / container boundary" />
      <Key swatch={<span className="h-3.5 w-5 rounded-[3px] border border-dashed" style={{ borderColor: '#D32929' }} />} label="Trust boundary" />
      <Key swatch={<svg width="22" height="8" viewBox="0 0 22 8"><path d="M0,4 L18,4" stroke={LINE} strokeWidth="1.3" /><path d="M15,0.5 L22,4 L15,7.5z" fill={LINE} /></svg>} label="Uses (caller → callee) · purpose [technology]" />
    </div>
  )
}
