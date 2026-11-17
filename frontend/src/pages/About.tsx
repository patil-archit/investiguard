import clsx from 'clsx'
import { useState } from 'react'
import { go } from '../App'
import { Arrow, C, Mascot, Marquee, Reveal, SpinBadge, Sticker } from '../components/brand'

const BELIEFS = [
  { n: '01', word: 'Guess small', text: 'Start from a short list of suspects instead of reading everything and hoping. Each guess names the few columns it needs.', bg: C.scarlet },
  { n: '02', word: 'Ask for less', text: 'Access is a signed key for one guess, with a fuse measured in seconds. Personal data is counted, never listed.', bg: C.oxblood },
  { n: '03', word: 'Let code judge', text: 'Language models are good at ideas and bad at arithmetic. Deterministic statistics decide what is true.', bg: C.tangerine },
  { n: '04', word: 'Distrust the text', text: 'Data can talk back. Instruction-like cells are masked before a model reads them, and model output is never trusted as code.', bg: C.ink },
  { n: '05', word: 'Leave a receipt', text: 'If an agent touched your data, you should be able to prove exactly what, when and why. And spot any edit afterwards.', bg: C.mustard },
]

const COMPARE: { row: string; us: boolean; ai: boolean; bi: boolean; sql: boolean }[] = [
  { row: 'Finds the root cause, not just a chart', us: true, ai: true, bi: false, sql: false },
  { row: 'Reads only the columns each test needs', us: true, ai: false, bi: false, sql: false },
  { row: 'Statistics decide the verdict, not the model', us: true, ai: false, bi: true, sql: false },
  { row: 'Personal data counted, never shown raw', us: true, ai: false, bi: false, sql: false },
  { row: 'Masks instructions planted in the data', us: true, ai: false, bi: false, sql: false },
  { row: 'Tamper-evident record of every access', us: true, ai: false, bi: false, sql: false },
  { row: 'Human approval for gated access', us: true, ai: false, bi: false, sql: false },
]

const FAQ = [
  ['Is this just text-to-SQL with extra steps?', 'No. Text-to-SQL answers the question you typed. InvestiGuard works out which questions to ask, runs them with the least access that can settle each one, and stops when the evidence is in.'],
  ['Does least privilege make it worse at finding causes?', 'On our six planted-cause scenarios it found 5, while the same model with every column open found none. Narrow, structured tests turned out to be easier to get right.'],
  ['What does the model actually see?', 'The schema with sensitivity labels, the problem statement, and the aggregated results of the queries it was allowed to run, after the injection firewall has masked anything instruction-like.'],
  ['Can I trust the receipt?', 'Every event is hash-chained and the chain is signed with a server key. The report re-verifies it, and the "simulate tampering" button shows a single edit breaking the seal.'],
  ['What happens to model-written Python?', 'It runs in a Docker container with no network, a read-only filesystem, no environment secrets, a non-root user and tight CPU, memory and process limits, on the released rows only.'],
]

export default function About() {
  return (
    <div className="overflow-x-clip">
      {/* hero */}
      <section className="relative flex min-h-[92svh] flex-col justify-end overflow-hidden bg-oxblood px-4 pb-16 pt-32 text-paper sm:px-10">
        <div className="display pointer-events-none absolute -right-[4vw] top-[14vh] select-none text-[34vw] leading-none text-scarlet/60">?</div>
        <Sticker r={-5} className="w-max animate-[pop_.6s_.2s_both] bg-mustard text-ink">Our story</Sticker>
        <h1 className="display relative mt-6 max-w-[1200px] text-[clamp(56px,10vw,170px)]">
          <span className="block animate-[rise_.9s_.2s_cubic-bezier(.2,.8,.2,1)_both]">We gave an AI</span>
          <span className="block animate-[rise_.9s_.35s_cubic-bezier(.2,.8,.2,1)_both] text-blush">fewer keys.</span>
        </h1>
        <p className="relative mt-8 max-w-2xl font-label text-[12.5px] font-bold uppercase leading-relaxed tracking-[0.05em] text-paper/90">
          InvestiGuard began as an AIML project-based learning question: can an AI analyst find why a number moved without
          being handed the whole database? It turns out it can, and it gets better at it.
        </p>
        <Mascot size={300} mood="wink" head={C.blush} visor={C.ink} className="absolute bottom-10 right-[6%] hidden rotate-[8deg] animate-bob lg:block" />
      </section>
      <Marquee items={['Hypothesis-driven', 'Capability-scoped', 'Evidence-gated', 'Tamper-evident', 'Human-in-the-loop']}
        className="border-y-2 border-ink bg-mustard py-3 font-label text-[12px] font-bold uppercase tracking-[0.08em] text-ink" />

      {/* the problem */}
      <section className="bg-paper px-4 py-28 sm:px-10">
        <div className="mx-auto grid max-w-[1200px] gap-14 lg:grid-cols-2">
          <Reveal>
            <Sticker r={3} className="bg-scarlet text-paper">The problem</Sticker>
            <h2 className="display mt-6 text-[clamp(44px,5.6vw,86px)] text-ink">AI agents get the keys to everything.</h2>
          </Reveal>
          <Reveal delay={150} className="space-y-6 self-end text-[16px] leading-relaxed text-fg-2">
            <p>
              The usual way to point a language model at business data is to give it a connection string and a polite system prompt.
              It can then read any table, any column, any customer, for as long as the session lasts. Security people call that
              <b className="text-ink"> standing privilege</b>, and they spend their careers removing it from humans.
            </p>
            <p>
              Root-cause analysis makes it worse. "Why did revenue drop?" sounds like it needs everything, so the agent asks for everything:
              e-mails, phone numbers and salaries included, plus any text in the data that happens to look like an instruction.
            </p>
            <p className="font-label text-[12px] font-bold uppercase tracking-[0.05em] text-oxblood">
              We wanted the opposite: an investigator that earns each column, proves it needed it, and gives it back.
            </p>
          </Reveal>
        </div>
      </section>

      {/* beliefs */}
      <section className="bg-blush px-4 py-28 sm:px-10">
        <Reveal><h2 className="display mx-auto max-w-[1200px] text-[clamp(48px,7vw,116px)] text-paper">What we believe</h2></Reveal>
        <div className="mx-auto mt-14 max-w-[1200px] border-t-2 border-ink">
          {BELIEFS.map(b => <Belief key={b.n} {...b} />)}
        </div>
      </section>

      {/* comparison */}
      <section className="bg-paper px-4 py-28 sm:px-10">
        <div className="mx-auto max-w-[1200px]">
          <Reveal>
            <Sticker r={-3} className="bg-ink text-paper">What is new here</Sticker>
            <h2 className="display mt-6 max-w-4xl text-[clamp(44px,5.6vw,86px)] text-ink">Nobody else does all of this at once.</h2>
          </Reveal>
          <Reveal delay={120} className="mt-12 overflow-x-auto rounded-[22px] border-2 border-ink">
            <table className="w-full min-w-[640px] bg-surface">
              <thead>
                <tr className="bg-ink text-paper">
                  <th className="px-5 py-4 text-left font-label text-[10.5px] font-bold uppercase tracking-[0.1em]">Capability</th>
                  {['InvestiGuard', 'AI agent, full access', 'BI dashboards', 'Text-to-SQL'].map((h, i) => (
                    <th key={h} className={clsx('px-4 py-4 text-center font-label text-[10.5px] font-bold uppercase tracking-[0.08em]', i === 0 && 'bg-oxblood text-mustard')}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y-[1.5px] divide-line">
                {COMPARE.map(r => (
                  <tr key={r.row} className="transition hover:bg-blush/25">
                    <td className="px-5 py-3.5 text-[14px] font-medium text-ink">{r.row}</td>
                    {[r.us, r.ai, r.bi, r.sql].map((v, i) => (
                      <td key={i} className={clsx('px-4 py-3.5 text-center', i === 0 && 'bg-blush/20')}><Mark ok={v} strong={i === 0} /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Reveal>
        </div>
      </section>

      {/* stack */}
      <section className="overflow-hidden bg-ink py-16">
        <div className="mb-8 px-4 text-center font-label text-[11px] font-bold uppercase tracking-[0.14em] text-blush sm:px-10">Built with</div>
        <Marquee items={['LangGraph', 'FastAPI', 'sqlglot', 'HMAC-JWT', 'pandas', 'Docker', 'React 19', 'Tailwind 4', 'Recharts', 'SQLAlchemy']}
          sep="✶" className="display text-[clamp(40px,6vw,92px)] text-paper" speed={45} />
        <Marquee items={['Least privilege', 'Fail closed', 'Count, never list', 'Hash-chained', 'No network', 'Read-only']}
          sep="✶" reverse className="display mt-2 text-[clamp(40px,6vw,92px)] text-transparent [-webkit-text-stroke:2px_var(--color-blush)]" speed={45} />
      </section>

      {/* faq */}
      <section className="bg-paper px-4 py-28 sm:px-10">
        <div className="mx-auto grid max-w-[1200px] gap-12 lg:grid-cols-[1fr_1.4fr]">
          <Reveal>
            <h2 className="display text-[clamp(48px,6vw,96px)] text-ink">Fair questions</h2>
            <Mascot size={200} mood="wow" head={C.mustard} className="mt-8 rotate-[-8deg]" />
          </Reveal>
          <div className="border-t-2 border-ink">{FAQ.map(([q, a], i) => <Faq key={q} q={q} a={a} first={i === 0} />)}</div>
        </div>
      </section>

      {/* cta */}
      <section className="relative overflow-hidden bg-scarlet px-4 py-28 text-center text-paper sm:px-10">
        <h2 className="display mx-auto max-w-5xl text-[clamp(52px,8vw,132px)]">Go on, give it a problem.</h2>
        <div className="mt-12 flex justify-center">
          <SpinBadge text="Open the app · open the app · " size={170} fill={C.mustard} color={C.ink} onClick={() => go('investigate')}>
            <Arrow className="h-9 w-9" />
          </SpinBadge>
        </div>
        <Mascot size={220} mood="cool" head={C.paper} className="absolute -left-10 bottom-[-30px] hidden rotate-[16deg] md:block" />
        <Mascot size={180} mood="happy" head={C.blush} className="absolute -right-8 top-10 hidden rotate-[-18deg] md:block" />
      </section>
    </div>
  )
}

function Belief({ n, word, text, bg }: { n: string; word: string; text: string; bg: string }) {
  const light = bg === C.mustard
  return (
    <div className="group relative overflow-hidden border-b-2 border-ink" data-cursor="big">
      <div className="absolute inset-0 origin-left scale-x-0 transition-transform duration-500 ease-[cubic-bezier(.7,0,.2,1)] group-hover:scale-x-100" style={{ background: bg }} />
      <div className={clsx('relative grid items-center gap-4 py-7 transition-colors duration-300 md:grid-cols-[90px_1fr_1.1fr] md:px-4',
        light ? 'group-hover:text-ink' : 'group-hover:text-paper')}>
        <span className="font-label text-[12px] font-bold text-ink/60 group-hover:text-current">{n}</span>
        <span className="display text-[clamp(36px,4.6vw,72px)] text-ink transition-transform duration-500 group-hover:translate-x-3 group-hover:text-current">{word}</span>
        <span className="max-w-md text-[14.5px] leading-relaxed text-ink/80 group-hover:text-current">{text}</span>
      </div>
    </div>
  )
}

function Mark({ ok, strong }: { ok: boolean; strong?: boolean }) {
  return ok ? (
    <span className={clsx('inline-grid h-7 w-7 place-items-center rounded-full', strong ? 'bg-oxblood text-mustard' : 'bg-ink text-paper')}>
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5 6.5 12 13 4.5" /></svg>
    </span>
  ) : (
    <span className="inline-grid h-7 w-7 place-items-center rounded-full border-[1.5px] border-line-strong text-line-strong">
      <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
    </span>
  )
}

function Faq({ q, a, first }: { q: string; a: string; first?: boolean }) {
  const [open, setOpen] = useState(!!first)
  return (
    <div className="border-b-2 border-ink">
      <button onClick={() => setOpen(o => !o)} className="flex w-full items-center justify-between gap-6 py-6 text-left">
        <span className="display text-[clamp(20px,2.2vw,30px)] text-ink">{q}</span>
        <span className={clsx('grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 border-ink transition duration-300', open ? 'rotate-45 bg-ink text-paper' : 'text-ink')}>
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M8 2v12M2 8h12" /></svg>
        </span>
      </button>
      <div className="grid transition-all duration-500" style={{ gridTemplateRows: open ? '1fr' : '0fr' }}>
        <div className="overflow-hidden"><p className="max-w-2xl pb-7 text-[15px] leading-relaxed text-fg-2">{a}</p></div>
      </div>
    </div>
  )
}
