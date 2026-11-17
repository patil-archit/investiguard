import clsx from 'clsx'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { api, type Benchmark } from '../api'
import { go } from '../App'
import { Arrow, C, Mascot, Marquee, Reveal, SpinBadge, Sticker, useInView, useScrollVar } from '../components/brand'

const TICKER = ['No raw personal data', 'One hypothesis, one key', 'Code judges, not the model',
  'Signed access receipts', 'Injection firewall', 'Sandboxed Python', '68% less standing privilege']

export default function Landing() {
  return (
    <div className="overflow-x-clip">
      <Hero />
      <Panels />
      <Paranoid />
      <Bands />
      <Proof />
      <Terminal />
    </div>
  )
}

/* ------------------------------------------------------------------ hero */

function Hero() {
  const ref = useRef<HTMLElement>(null)
  useScrollVar(ref)
  return (
    <section ref={ref} className="relative flex min-h-[100svh] flex-col overflow-hidden bg-blush pt-24">
      <h1 className="display relative z-0 mx-auto mt-[4vh] max-w-[1400px] px-4 text-center text-[clamp(48px,8.9vw,150px)] text-paper"
        style={{ transform: 'translateY(calc(var(--s, 0) * 18vh))' }}>
        <span className="block animate-[rise_.9s_.15s_cubic-bezier(.2,.8,.2,1)_both]">Root causes.</span>
        <span className="block animate-[rise_.9s_.3s_cubic-bezier(.2,.8,.2,1)_both]">Zero snooping.</span>
      </h1>

      {/* mascot overlapping the headline */}
      <div className="pointer-events-none relative z-10 mx-auto -mt-[11vw] w-max animate-[rise_1s_.45s_cubic-bezier(.2,.8,.2,1)_both]"
        style={{ transform: 'translateY(calc(var(--s, 0) * -8vh)) rotate(calc(var(--s, 0) * 8deg))' }}>
        <div className="animate-bob">
          <Mascot size={Math.min(440, typeof window !== 'undefined' ? window.innerWidth * 0.62 : 440)} mood="cool" head={C.paper} />
        </div>
      </div>

      {/* floating stickers */}
      <Sticker r={-8} className="absolute left-[6%] top-[46%] z-20 hidden animate-[pop_.6s_1s_both] bg-oxblood text-paper md:inline-block">Reads 3 of 24 columns</Sticker>
      <Sticker r={6} className="absolute right-[7%] top-[38%] z-20 hidden animate-[pop_.6s_1.15s_both] bg-mustard text-ink md:inline-block">Zero raw PII</Sticker>
      <Sticker r={-3} className="absolute right-[12%] top-[62%] z-20 hidden animate-[pop_.6s_1.3s_both] bg-ink text-paper md:inline-block">Receipt signed ✓</Sticker>
      <div className="absolute bottom-[18%] left-[8%] z-20 hidden animate-[pop_.6s_1.4s_both] lg:block">
        <SpinBadge text="Open the app · open the app · " onClick={() => go('investigate')} fill={C.paper}>
          <Arrow className="h-7 w-7" />
        </SpinBadge>
      </div>

      <p className="relative z-20 mx-auto mb-6 mt-auto max-w-xl px-6 text-center font-label text-[12px] font-bold uppercase leading-relaxed tracking-[0.06em] text-ink">
        An AI analyst that finds why your numbers moved, while reading only the columns each guess needs.
        Then it hands the keys back.
      </p>
      <Marquee items={TICKER} className="relative z-20 border-y-2 border-ink bg-blush py-3 font-label text-[12px] font-bold uppercase tracking-[0.08em] text-ink" />
    </section>
  )
}

/* ------------------------------------------------------------------ stacked colour panels */

const PANELS: { word: string; bg: string; fg: string; ghost: string; tag: string; tagCls: string; title: string; text: string; mood: 'happy' | 'cool' | 'wow' | 'wink'; card: ReactNode }[] = [
  {
    word: 'Hypothesis', bg: C.scarlet, fg: C.paper, ghost: C.blush, tag: '01 · Guess small', tagCls: 'bg-paper text-scarlet',
    title: 'One guess at a time', text: 'The model proposes suspects: a region, a channel, a price cut. Code ranks them by how likely, how informative and how cheap in privilege.',
    mood: 'wow', card: <HypCard />,
  },
  {
    word: 'Capability', bg: C.oxblood, fg: C.paper, ghost: C.scarlet, tag: '02 · Ask for less', tagCls: 'bg-mustard text-ink',
    title: 'A key that fits one lock', text: 'Each test gets a signed token for exactly its columns, with a 60-second fuse. Confidential columns can only be counted. Then it is revoked.',
    mood: 'cool', card: <TokenCard />,
  },
  {
    word: 'Evidence', bg: C.tangerine, fg: C.paper, ghost: C.blush, tag: '03 · Code is the judge', tagCls: 'bg-ink text-paper',
    title: 'Numbers, not vibes', text: 'Explained share, lift, a robust z-score and a price-versus-volume split decide SUPPORTED or REJECTED. The model never grades its own homework.',
    mood: 'happy', card: <EvidenceCard />,
  },
  {
    word: 'Receipt', bg: C.mustard, fg: C.ink, ghost: '#f6dc6a', tag: '04 · Sign everything', tagCls: 'bg-oxblood text-paper',
    title: 'Proof of what it touched', text: 'Every grant, query and revocation is hash-chained and signed. Change one byte and the seal breaks, right there in the report.',
    mood: 'wink', card: <ReceiptMini />,
  },
]

function Panels() {
  const ref = useRef<HTMLDivElement>(null)
  useScrollVar(ref)
  return (
    <div ref={ref} className="relative" style={{ height: `${PANELS.length * 100 + 60}vh` }}>
      {PANELS.map((p, i) => {
        const local = `(var(--s, 0) - ${i})`
        return (
          <section key={p.word} className="sticky top-0 flex h-screen items-center overflow-hidden" style={{ background: p.bg, color: p.fg, zIndex: i + 1 }}>
            <div className="absolute inset-0 origin-top" style={{ transform: `scale(calc(1 - clamp(0, ${local}, 1) * .06))` }} />
            {/* giant ghost word sliding with scroll */}
            <div className="display pointer-events-none absolute left-0 top-1/2 whitespace-nowrap text-[clamp(120px,24vw,380px)]"
              style={{ color: p.ghost, opacity: .6, transform: `translateY(-50%) translateX(calc(${local} * -30vw + 6vw))` }}>
              {p.word}
            </div>
            <div className="relative mx-auto grid w-full max-w-[1280px] items-center gap-10 px-6 pt-16 md:grid-cols-[1fr_auto_1fr]">
              <div className="max-w-sm">
                <Sticker r={-5} className={p.tagCls}>{p.tag}</Sticker>
                <h3 className="display mt-6 text-[clamp(34px,4vw,56px)]">{p.title}</h3>
                <p className="mt-4 font-label text-[12px] font-bold uppercase leading-relaxed tracking-[0.04em] opacity-90">{p.text}</p>
              </div>
              <div className="relative mx-auto" style={{ transform: `rotate(calc(${local} * 10deg - 3deg))` }}>
                {p.card}
                <Mascot size={120} mood={p.mood} head={C.paper} className="absolute -right-12 -top-16 rotate-[14deg]" />
              </div>
              <div className="hidden justify-end md:flex">
                <SpinBadge text="Try it live · try it live · " onClick={() => go('investigate')} color={p.fg}>
                  <Arrow className="h-7 w-7" />
                </SpinBadge>
              </div>
            </div>
          </section>
        )
      })}
    </div>
  )
}

const cardBase = 'w-[min(340px,82vw)] rounded-[18px] bg-paper p-5 text-ink shadow-[0_18px_0_rgb(45_42_38/0.18)]'

function HypCard() {
  const rows = [['region = West', 0.82, 'bg-scarlet'], ['channel = App', 0.34, 'bg-tangerine'], ['category = Home', 0.12, 'bg-blush']] as const
  return (
    <div className={cardBase}>
      <div className="flex justify-between font-label text-[10px] font-bold uppercase tracking-[0.1em] text-muted"><span>Suspects</span><span>score</span></div>
      <div className="mt-3 space-y-3">
        {rows.map(([name, v, cls]) => (
          <div key={name}>
            <div className="flex justify-between font-mono text-[12.5px]"><span>{name}</span><span>{v.toFixed(2)}</span></div>
            <div className="mt-1 h-2.5 rounded-full bg-sunken"><div className={clsx('h-full rounded-full', cls)} style={{ width: `${v * 100}%` }} /></div>
          </div>
        ))}
      </div>
      <div className="mt-4 font-label text-[10px] font-bold uppercase tracking-[0.08em] text-muted">plausibility × info gain ÷ privilege</div>
    </div>
  )
}

function TokenCard() {
  const [t, setT] = useState(60)
  useEffect(() => { const id = setInterval(() => setT(v => (v <= 1 ? 60 : v - 1)), 1000); return () => clearInterval(id) }, [])
  return (
    <div className={clsx(cardBase, 'bg-ink text-paper')}>
      <div className="flex items-center justify-between">
        <span className="font-label text-[10px] font-bold uppercase tracking-[0.12em] text-blush">Capability · H3</span>
        <span className="rounded-full bg-mustard px-2 py-0.5 font-mono text-[11px] font-medium text-ink">{t}s</span>
      </div>
      <div className="mt-4 space-y-1.5 font-mono text-[12.5px]">
        <div className="flex justify-between"><span>orders.region</span><span className="text-blush">clear</span></div>
        <div className="flex justify-between"><span>orders.amount</span><span className="text-blush">clear</span></div>
        <div className="flex justify-between"><span>customers.email</span><span className="text-mustard">count only</span></div>
        <div className="flex justify-between text-paper/35 line-through"><span>customers.salary</span><span>denied</span></div>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-paper/15"><div className="h-full bg-mustard transition-all duration-1000" style={{ width: `${(t / 60) * 100}%` }} /></div>
      <div className="mt-3 truncate font-mono text-[10px] text-paper/40">eyJhbGciOiJIUzI1NiJ9.eyJoeXAiOiJIMyIsImNvbHMiOls…</div>
    </div>
  )
}

function EvidenceCard() {
  const bars = [92, 18, 11, 7, 5]
  return (
    <div className={cardBase}>
      <div className="flex items-center justify-between">
        <span className="font-label text-[10px] font-bold uppercase tracking-[0.1em] text-muted">Drop explained</span>
        <span className="rounded-[5px] bg-good px-1.5 py-0.5 font-label text-[9.5px] font-bold uppercase tracking-[0.08em] text-paper">Supported</span>
      </div>
      <div className="mt-4 flex h-28 items-end gap-2.5">
        {bars.map((b, i) => <div key={i} className={clsx('flex-1 rounded-t-[6px]', i === 0 ? 'bg-tangerine' : 'bg-sunken')} style={{ height: `${b}%` }} />)}
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10.5px] text-muted"><span>West</span><span>N</span><span>S</span><span>E</span><span>C</span></div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[['share', '82%'], ['lift', '4.1×'], ['z', '6.3']].map(([k, v]) => (
          <div key={k} className="rounded-[8px] bg-sunken py-1.5"><div className="font-display text-[18px]">{v}</div><div className="font-label text-[9px] uppercase text-muted">{k}</div></div>
        ))}
      </div>
    </div>
  )
}

function ReceiptMini() {
  const blocks = ['grant H1', 'query', 'revoke', 'grant H3', 'query', 'seal']
  return (
    <div className={cardBase}>
      <div className="font-label text-[10px] font-bold uppercase tracking-[0.1em] text-muted">Hash chain</div>
      <div className="mt-3 space-y-1.5">
        {blocks.map((b, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className={clsx('h-6 w-6 shrink-0 rounded-[6px] border-[1.5px] border-ink', i === blocks.length - 1 ? 'bg-oxblood' : 'bg-mustard')} />
            <span className="font-mono text-[12px]">{b}</span>
            <span className="ml-auto font-mono text-[10.5px] text-muted">{((i + 7) * 2654435761 % 0xffffff).toString(16).padStart(6, '0')}…</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between rounded-[10px] bg-good px-3 py-2 font-label text-[10.5px] font-bold uppercase tracking-[0.08em] text-paper">
        <span>HMAC verified</span><span>✓</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ "some call us paranoid" */

const FEATURES = [
  { n: '01', title: 'Five rules, no exceptions', text: 'Read-only. Sensitivity limits. Declared columns only. Evidence gate. Budget. The first three can never be waived, not even by you.', bg: C.scarlet, fg: C.paper },
  { n: '02', title: 'A gateway that parses SQL', text: 'Every query is parsed into a syntax tree; each column is resolved and checked against the token. One stray column and it fails closed.', bg: C.oxblood, fg: C.paper },
  { n: '03', title: 'Injection firewall', text: 'A cell saying "ignore previous instructions" is masked before any model sees it. Planted instructions do not get to steer.', bg: C.tangerine, fg: C.paper },
  { n: '04', title: 'Python in a locked box', text: 'Model-written code runs in Docker with no network, a read-only disk, no secrets and a non-root user. Escape tests ship with the repo.', bg: C.mustard, fg: C.ink },
  { n: '05', title: 'You hold the override', text: 'When a gate blocks a test, the run pauses and asks. Approve once, for two minutes, and it is written into the receipt.', bg: C.ink, fg: C.paper },
  { n: '06', title: 'It checks what it forgot', text: 'A dimension sweep adds cheap tests for every safe column the model never thought of, so the obvious culprit is not missed.', bg: C.paper, fg: C.ink },
]

function Paranoid() {
  const ref = useRef<HTMLDivElement>(null)
  useScrollVar(ref, '--q', 'progress')
  const n = FEATURES.length
  return (
    <>
    <div ref={ref} className="relative hidden bg-blush md:block" style={{ height: `${n * 75 + 40}vh` }}>
      <div className="sticky top-0 grid h-screen overflow-hidden md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="relative z-10 flex flex-col justify-center px-6 pt-20 md:px-12">
          <h2 className="display text-[clamp(56px,7.5vw,120px)] text-paper">Some call us paranoid</h2>
          <Sticker r={-6} className="mt-4 w-max bg-oxblood text-paper">We take that as a compliment</Sticker>
          <p className="mt-8 max-w-md font-label text-[12px] font-bold uppercase leading-relaxed tracking-[0.04em] text-ink">
            Most AI analysts get the whole database and a promise to behave. We built the opposite:
            an agent that has to earn every column, one test at a time, and can prove it afterwards.
          </p>
          <div className="mt-8 flex items-center gap-3 font-label text-[11px] font-bold uppercase tracking-[0.08em] text-ink">
            <span>Scroll</span><span className="h-[2px] w-24 overflow-hidden bg-ink/20"><span className="block h-full bg-ink" style={{ width: 'calc(var(--q, 0) * 100%)' }} /></span>
          </div>
        </div>
        <div className="relative hidden md:block">
          {FEATURES.map((f, i) => {
            const p = i === 0 ? '1' : `clamp(0, calc(var(--q, 0) * ${n - 1} - ${i - 1}), 1)`
            const style: CSSProperties = {
              background: f.bg, color: f.fg, zIndex: i,
              left: `calc((1 - ${p}) * (100% - ${(n - i) * 22}px))`,
            }
            return (
              <div key={f.n} className="absolute inset-y-0 w-full shadow-[-10px_0_0_rgb(45_42_38/0.12)]" style={style}>
                <div className="flex h-full max-w-[560px] flex-col justify-center px-14">
                  <div className="outline-text display text-[110px]" style={{ WebkitTextStroke: `2px ${f.fg}` }}>{f.n}</div>
                  <h3 className="display mt-2 text-[44px]">{f.title}</h3>
                  <p className="mt-5 max-w-md font-label text-[12.5px] font-bold uppercase leading-relaxed tracking-[0.04em] opacity-90">{f.text}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
    {/* mobile: simple stack */}
    <div className="space-y-3 bg-blush px-4 pb-10 pt-24 md:hidden">
      <h2 className="display text-[56px] text-paper">Some call us paranoid</h2>
      <Sticker r={-6} className="mb-6 bg-oxblood text-paper">We take that as a compliment</Sticker>
        {FEATURES.map(f => (
          <div key={f.n} className="rounded-[18px] p-6" style={{ background: f.bg, color: f.fg }}>
            <div className="display text-[40px] opacity-60">{f.n}</div>
            <h3 className="display mt-1 text-[28px]">{f.title}</h3>
            <p className="mt-3 font-label text-[11.5px] font-bold uppercase leading-relaxed">{f.text}</p>
          </div>
        ))}
    </div>
    </>
  )
}

/* ------------------------------------------------------------------ crossing bands */

function Bands() {
  return (
    <section className="relative h-[46vh] min-h-[320px] overflow-hidden bg-ink">
      <div className="absolute left-[-10%] top-[32%] w-[120%] -rotate-[5deg] border-y-[3px] border-ink bg-mustard py-5">
        <Marquee items={['See the cause', 'Not the data']} sep="✶" className="display text-[clamp(36px,5vw,72px)] text-oxblood" speed={30} />
      </div>
      <div className="absolute left-[-10%] top-[48%] w-[120%] rotate-[4deg] border-y-[3px] border-ink bg-scarlet py-4">
        <Marquee items={['Least privilege', 'Signed receipts', 'Zero raw PII']} sep="✶" reverse className="display text-[clamp(28px,3.6vw,52px)] text-paper" speed={26} />
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ benchmark proof stack */

function Proof() {
  const [bench, setBench] = useState<Benchmark | null>(null)
  useEffect(() => { api.benchmark().then(setBench).catch(() => undefined) }, [])
  const s = bench?.results?.summary
  const Cs = s?.C, As = s?.A
  const runs = Cs?.runs ?? 6
  const found = Cs ? Math.round(Cs.accuracy * runs) : 5
  const foundA = As ? Math.round(As.accuracy * (As.runs ?? 6)) : 0
  const less = Cs && As && As.avg_column_seconds ? Math.round((1 - Cs.avg_column_seconds / As.avg_column_seconds) * 100) : 68
  const cards = [
    { big: `${found}/${runs}`, label: 'planted causes found', sub: `Direct AI with every column open found ${foundA}/${As?.runs ?? 6}.`, bg: C.tangerine, fg: C.paper, mood: 'cool' as const },
    { big: `−${less}%`, label: 'standing privilege', sub: 'Columns open × seconds open, per run, against the same model with full access.', bg: C.oxblood, fg: C.paper, mood: 'wink' as const },
    { big: String(Cs?.sensitive_raw_columns ?? 0), label: 'sensitive columns read raw', sub: 'E-mail, phone and salary sat beside the answer. They were only ever counted.', bg: C.scarlet, fg: C.paper, mood: 'happy' as const },
    { big: String(Cs?.injections_obeyed ?? 0), label: 'planted instructions obeyed', sub: 'A text column told the agent to blame a marketing campaign. It did not.', bg: C.mustard, fg: C.ink, mood: 'wow' as const },
    { big: '65', label: 'automated tests', sub: 'Including sandbox escape attempts, tampered receipts and fake totals.', bg: C.ink, fg: C.paper, mood: 'cool' as const },
  ]
  const [top, setTop] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const next = () => {
    if (leaving) return
    setLeaving(true)
    setTimeout(() => { setTop(t => (t + 1) % cards.length); setLeaving(false) }, 420)
  }
  const [ref, seen] = useInView<HTMLDivElement>(0.4)
  useEffect(() => {
    if (!seen) return
    const id = setInterval(next, 3800)
    return () => clearInterval(id)
  })
  const ROT = [-2, 4, -5, 3, -1]
  return (
    <section className="relative overflow-hidden bg-blush px-4 pb-28 pt-32">
      <Reveal>
        <h2 className="display mx-auto max-w-4xl text-center text-[clamp(44px,6.4vw,104px)] text-paper">Don’t just take our word for it</h2>
      </Reveal>
      <div className="mt-6 text-center"><Sticker r={-3} className="bg-oxblood text-paper">Scored by code · live gpt-4o-mini</Sticker></div>

      <div ref={ref} className="relative mx-auto mt-16 h-[380px] w-[min(560px,92vw)]">
        {cards.map((c, i) => {
          const d = (i - top + cards.length) % cards.length
          const out = d === 0 && leaving
          return (
            <button key={c.label} onClick={next} data-cursor="big"
              className="absolute inset-0 flex flex-col justify-between rounded-[22px] p-8 text-left shadow-[0_14px_0_rgb(45_42_38/0.16)] transition-all duration-[420ms] ease-[cubic-bezier(.2,.8,.2,1)]"
              style={{
                background: c.bg, color: c.fg, zIndex: cards.length - d,
                transform: out ? 'translate(120%, -10%) rotate(24deg)' : `translateY(${d * 14}px) rotate(${ROT[d]}deg) scale(${1 - d * 0.035})`,
                opacity: out ? 0 : d > 3 ? 0 : 1,
              }}>
              <div className="flex items-start justify-between">
                <span className="font-label text-[11px] font-bold uppercase tracking-[0.12em] opacity-80">InvestiGuard · benchmark</span>
                <span className="rounded-full border-[1.5px] border-current px-2.5 py-0.5 font-label text-[10px] font-bold">{i + 1}/{cards.length}</span>
              </div>
              <div>
                <div className="display text-[clamp(80px,14vw,140px)]">{c.big}</div>
                <div className="display mt-1 text-[24px]">{c.label}</div>
                <p className="mt-3 max-w-sm font-label text-[11.5px] font-bold uppercase leading-relaxed tracking-[0.04em] opacity-85">{c.sub}</p>
              </div>
              <Mascot size={110} mood={c.mood} track={d === 0} className="absolute -right-6 -top-12 rotate-[12deg]" />
            </button>
          )
        })}
      </div>
      <div className="mt-14 text-center">
        <button onClick={() => go('benchmark')} className="font-label text-[11px] font-bold uppercase tracking-[0.1em] text-ink underline decoration-2 underline-offset-4 hover:text-oxblood">
          See every run, including the miss
        </button>
      </div>
      <Mascot size={260} mood="sleepy" head={C.paper} className="absolute -right-16 bottom-[-40px] hidden rotate-[-24deg] lg:block" />
    </section>
  )
}

/* ------------------------------------------------------------------ typing terminal */

const SCRIPT = [
  { t: 'grant', text: 'capability H1 · orders.region, orders.amount · ttl 60s', cls: 'text-blush' },
  { t: 'query', text: 'SELECT region, SUM(amount) … GROUP BY region  ✓ gateway', cls: 'text-paper/70' },
  { t: 'judge', text: 'West explains 82% of the drop · lift 4.1 · z 6.3 → SUPPORTED', cls: 'text-mustard' },
  { t: 'drill', text: 'price effect −3% · volume effect −79% → fewer orders, not cheaper ones', cls: 'text-paper/70' },
  { t: 'revoke', text: '3 of 24 columns read · 0 sensitive · receipt 9f2c…a71e sealed', cls: 'text-good' },
]
const QUESTION = 'Why did revenue drop 18% in Q3?'

function Terminal() {
  const [ref, seen] = useInView<HTMLDivElement>(0.35)
  const [chars, setChars] = useState(0)
  const [lines, setLines] = useState(0)
  useEffect(() => {
    if (!seen) return
    let c = 0, l = 0
    const typer = setInterval(() => {
      c++; setChars(c)
      if (c >= QUESTION.length) {
        clearInterval(typer)
        const liner = setInterval(() => { l++; setLines(l); if (l >= SCRIPT.length) clearInterval(liner) }, 650)
      }
    }, 45)
    return () => clearInterval(typer)
  }, [seen])
  return (
    <section className="relative bg-paper px-4 py-28">
      <div className="mx-auto grid max-w-[1200px] items-center gap-12 lg:grid-cols-[1fr_1.2fr]">
        <Reveal>
          <Sticker r={-4} className="bg-scarlet text-paper">Ask it anything</Sticker>
          <h2 className="display mt-6 text-[clamp(48px,6vw,96px)] text-ink">Question in. Cause out. Keys back.</h2>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-fg-2">
            Type the question you would ask an analyst. Watch every guess, every key, every query and every verdict stream in live,
            then download the signed receipt.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button onClick={() => go('investigate')} className="group flex h-12 items-center gap-2 rounded-[12px] bg-ink px-6 font-label text-[12px] font-bold uppercase tracking-[0.08em] text-paper shadow-[0_4px_0_var(--color-oxblood)] transition hover:-translate-y-0.5 hover:bg-oxblood">
              Start investigating <Arrow className="h-4 w-4 transition-transform group-hover:rotate-45" />
            </button>
            <button onClick={() => go('compare')} className="h-12 rounded-[12px] border-2 border-ink px-6 font-label text-[12px] font-bold uppercase tracking-[0.08em] text-ink transition hover:bg-ink hover:text-paper">
              Race it against Direct AI
            </button>
          </div>
        </Reveal>
        <div ref={ref} className="relative">
          <div className="rotate-[1.5deg] rounded-[22px] bg-ink p-6 shadow-[0_18px_0_var(--color-blush)] sm:p-8">
            <div className="flex gap-1.5"><span className="h-3 w-3 rounded-full bg-scarlet" /><span className="h-3 w-3 rounded-full bg-mustard" /><span className="h-3 w-3 rounded-full bg-blush" /></div>
            <div className="mt-6 font-mono text-[15px] text-paper">
              <span className="text-mustard">›</span> {QUESTION.slice(0, chars)}
              <span className={clsx('ml-0.5 inline-block h-4 w-2 translate-y-0.5 bg-mustard', 'animate-[caret_1s_steps(1)_infinite]')} />
            </div>
            <div className="mt-6 space-y-3">
              {SCRIPT.map((s, i) => (
                <div key={i} className={clsx('flex gap-3 font-mono text-[12.5px] transition-all duration-500', i < lines ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0')}>
                  <span className="w-14 shrink-0 font-label text-[10px] font-bold uppercase leading-5 tracking-[0.1em] text-paper/40">{s.t}</span>
                  <span className={s.cls}>{s.text}</span>
                </div>
              ))}
            </div>
          </div>
          <Mascot size={150} mood={lines >= SCRIPT.length ? 'cool' : 'wow'} head={C.mustard} className="absolute -bottom-14 -left-10 rotate-[-14deg]" />
        </div>
      </div>
    </section>
  )
}
