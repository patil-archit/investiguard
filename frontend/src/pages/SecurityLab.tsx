import clsx from 'clsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api, type SecurityStatus, type ThreatCatalogue, type ThreatResult, type ThreatSummary } from '../api'
import { Arrow, C, Mascot, Marquee, Sticker } from '../components/brand'
import { Term } from '../components/gloss'
import { CountUp } from '../components/studio'
import { CodeBlock, ErrorNote } from '../components/ui'

const CLASS_BG: Record<string, string> = { T1: C.scarlet, T2: C.oxblood, T3: C.tangerine, T4: C.ink, T5: '#8a6d1f', T6: '#b0413e', OK: '#2e7046' }

export default function SecurityLab() {
  const [cat, setCat] = useState<ThreatCatalogue | null>(null)
  const [sec, setSec] = useState<SecurityStatus | null>(null)
  const [results, setResults] = useState<Record<string, ThreatResult>>({})
  const [summary, setSummary] = useState<ThreatSummary | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pick, setPick] = useState<string | null>(null)
  const [lastHit, setLastHit] = useState<string | null>(null)
  const es = useRef<EventSource | null>(null)

  useEffect(() => {
    api.threats().then(c => {
      setCat(c)
      if (c.last.results.length) { setResults(Object.fromEntries(c.last.results.map(r => [r.id, r]))); setSummary(c.last.summary) }
    }).catch(e => setError((e as Error).message))
    api.security().then(setSec).catch(() => undefined)
    return () => es.current?.close()
  }, [])

  const start = () => {
    es.current?.close()
    setResults({}); setSummary(null); setRunning(true); setError(null); setPick(null)
    const s = new EventSource('/api/threats/run')
    es.current = s
    s.onmessage = m => { const r = JSON.parse(m.data) as ThreatResult; setResults(x => ({ ...x, [r.id]: r })); setLastHit(r.id) }
    s.addEventListener('end', m => {
      setSummary(JSON.parse((m as MessageEvent).data)); setRunning(false); s.close()
      api.security().then(setSec).catch(() => undefined)
    })
    s.onerror = () => { setRunning(false); s.close(); setError('The attack stream stopped. Is the server running?') }
  }

  const done = Object.keys(results).length
  const total = cat?.cases.length ?? 44
  const attacks = Object.values(results).filter(r => r.cls !== 'OK')
  const tested = attacks.filter(r => r.outcome !== 'skipped')
  const blocked = tested.filter(r => r.outcome === 'blocked').length
  const rate = tested.length ? blocked / tested.length : 0
  const layers = useMemo(() => {
    const m: Record<string, number> = {}
    attacks.filter(r => r.outcome === 'blocked').forEach(r => { const k = r.layer.replace(/ \(.*\)/, ''); m[k] = (m[k] ?? 0) + 1 })
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [attacks])
  const picked = cat?.cases.find(c => c.id === pick)

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------ hero */}
      <section className="relative overflow-hidden rounded-[26px] bg-ink px-5 pb-8 pt-8 text-paper sm:px-9">
        <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'repeating-linear-gradient(0deg, #eae6e3 0 1px, transparent 1px 4px)' }} />
        <div className="relative grid items-center gap-8 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <Sticker r={-4} className="bg-scarlet text-paper">Security lab · synopsis table 7.2</Sticker>
            <h1 className="display mt-5 text-[clamp(44px,6.4vw,96px)]">Go on. <span className="text-mustard">Try to break it.</span></h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-paper/80">
              Forty real attacks fired at the real components: sneaky SQL, forged keys, malicious code, data theft and
              {' '}<Term t="prompt injection">hidden instructions</Term>. Plus four normal requests that must still work. Nothing is faked:
              a tile turns black only if the actual policy engine, gateway, firewall or sandbox refused.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <button onClick={start} disabled={running}
                className="group flex h-12 items-center gap-2 rounded-[12px] bg-mustard px-6 font-label text-[12px] font-bold uppercase tracking-[0.08em] text-ink shadow-[0_4px_0_var(--color-scarlet)] transition hover:-translate-y-0.5 disabled:opacity-60">
                {running ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-ink/30 border-t-ink" /> Attacking {done}/{total}</>
                  : <>{done ? 'Launch again' : 'Launch all 44'} <Arrow className="h-4 w-4 transition-transform group-hover:rotate-45" /></>}
              </button>
              {sec && <SandboxPill sec={sec} onRefresh={() => api.systemRefresh().then(() => api.security().then(setSec))} />}
            </div>
          </div>
          <Gauge rate={rate} tested={tested.length} blocked={blocked} running={running} summary={summary} />
        </div>
        <Mascot size={130} mood={running ? 'x' : summary ? 'cool' : 'wow'} head={C.mustard} visor={C.ink}
          className="absolute -bottom-8 right-[38%] hidden rotate-[8deg] lg:block" />
      </section>
      {error && <ErrorNote error={error} />}

      {/* ------------------------------------------------ attack grid */}
      <section className="space-y-3">
        {cat && Object.entries(cat.classes).map(([k, info]) => {
          const cases = cat.cases.filter(c => c.cls === k)
          const got = cases.map(c => results[c.id]).filter(Boolean)
          return (
            <div key={k} className="card overflow-hidden">
              <div className="grid gap-4 p-4 md:grid-cols-[280px_1fr] md:p-5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-[8px] px-2 py-1 font-display text-[16px] text-paper" style={{ background: CLASS_BG[k] }}>{k}</span>
                    <span className="display text-[20px] text-ink">{info.name}</span>
                  </div>
                  <p className="mt-2 text-[12.5px] leading-snug text-muted">{info.plain}</p>
                  <div className="mt-2 font-label text-[9.5px] font-bold uppercase tracking-[0.1em] text-oxblood">Expected: {info.expected}</div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken">
                    <div className="h-full rounded-full bg-ink transition-all duration-500" style={{ width: `${(got.length / cases.length) * 100}%` }} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                  {cases.map(c => <Tile key={c.id} id={c.id} title={c.title} r={results[c.id]} fresh={lastHit === c.id}
                    pending={running && !results[c.id]} active={pick === c.id} onClick={() => setPick(pick === c.id ? null : c.id)} />)}
                </div>
              </div>
              {picked && picked.cls === k && (
                <div className="animate-fade-in border-t-[1.5px] border-line bg-sunken/60 p-5">
                  <div className="grid gap-5 lg:grid-cols-2">
                    <div>
                      <div className="font-label text-[10px] font-bold uppercase tracking-[0.12em] text-oxblood">{picked.id} · the attack</div>
                      <h3 className="display mt-1 text-[24px] text-ink">{picked.title}</h3>
                      <p className="mt-2 text-[14px] leading-relaxed text-fg-2">{picked.plain}</p>
                      <div className="mt-3"><CodeBlock code={picked.attack} /></div>
                    </div>
                    <div>
                      <div className="font-label text-[10px] font-bold uppercase tracking-[0.12em] text-oxblood">What happened</div>
                      {results[picked.id] ? (
                        <div className="mt-2 space-y-2">
                          <Verdict r={results[picked.id]} />
                          <div className="rounded-[12px] bg-surface p-3.5 text-[13px] leading-relaxed text-fg-2">
                            <b className="font-label text-[10px] uppercase tracking-[0.1em] text-ink">Stopped by:</b> {results[picked.id].layer}<br />
                            <span className="font-mono text-[12px]">{results[picked.id].detail}</span>
                          </div>
                          <div className="font-mono text-[11px] text-muted">decided in {results[picked.id].ms} ms</div>
                        </div>
                      ) : <p className="mt-2 text-[13px] text-muted">Not fired yet. Press Launch.</p>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </section>

      {/* ------------------------------------------------ defence in depth */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <div className="font-label text-[9.5px] font-bold uppercase tracking-[0.14em] text-oxblood">defence in depth</div>
          <h2 className="display mt-1 text-[24px] text-ink">Which wall stopped what</h2>
          <p className="mt-1 text-[12.5px] text-muted">Every attack has to get past several independent layers. This is the one that caught it first.</p>
          <div className="mt-5 space-y-3">
            {layers.length === 0 && <p className="text-[13px] text-muted">Launch the attacks to fill this in.</p>}
            {layers.map(([l, n], i) => (
              <div key={l}>
                <div className="flex justify-between font-label text-[10.5px] font-bold uppercase tracking-[0.06em] text-ink"><span>{l}</span><span>{n}</span></div>
                <div className="mt-1 h-4 overflow-hidden rounded-[6px] bg-sunken">
                  <div className="h-full rounded-[6px] transition-all duration-700" style={{ width: `${(n / Math.max(...layers.map(x => x[1]))) * 100}%`, background: [C.oxblood, C.scarlet, C.tangerine, C.mustard, C.ink, C.blush][i % 6] }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-5">
          <div className="font-label text-[9.5px] font-bold uppercase tracking-[0.14em] text-oxblood">the scorecard</div>
          <h2 className="display mt-1 text-[24px] text-ink">Against the synopsis targets</h2>
          <div className="mt-4 divide-y-[1.5px] divide-line">
            <Target label={<Term t="block rate">Block rate</Term>} goal="100%" value={tested.length ? `${(rate * 100).toFixed(0)}%` : '–'} ok={tested.length ? rate === 1 : null} />
            <Target label={<Term t="false denial">False denials</Term>} goal="≤ 5%" value={summary ? `${summary.false_denials}/${summary.legit}` : '–'} ok={summary ? summary.false_denials === 0 : null} />
            <Target label="Attacks actually fired" goal="40" value={summary ? `${summary.tested}/${summary.attacks}` : '–'} ok={summary ? summary.skipped === 0 : null}
              note={summary?.skipped ? `${summary.skipped} sandbox cases need Docker running to fire; they are not counted as blocked.` : undefined} />
            <Target label="Sensitive data leaked" goal="0" value={summary ? String(attacks.filter(r => r.outcome === 'allowed').length) : '–'} ok={summary ? attacks.every(r => r.outcome !== 'allowed') : null} />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ all controls */}
      {sec && (
        <section className="card overflow-hidden">
          <div className="border-b-[1.5px] border-line px-5 pb-3 pt-4">
            <div className="font-label text-[9.5px] font-bold uppercase tracking-[0.14em] text-oxblood">every lock on every door</div>
            <h2 className="display mt-1 text-[24px] text-ink">Security controls, in plain words</h2>
            <p className="mt-1 text-[12.5px] text-muted">Signing key fingerprint <span className="font-mono text-ink">{sec.signing_key.key_id}</span> · from {sec.signing_key.source}. The key itself never leaves the server.</p>
          </div>
          <div className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-4">
            {sec.controls.map(c => (
              <div key={c.name} className="group bg-surface p-4 transition hover:bg-blush/20">
                <div className="flex items-center justify-between">
                  <span className="rounded-[5px] bg-ink px-1.5 py-0.5 font-label text-[9px] font-bold uppercase tracking-[0.1em] text-paper">{c.layer}</span>
                  {c.stat != null && <span className="font-mono text-[10.5px] text-muted">{c.stat} stopped</span>}
                </div>
                <div className="mt-2 text-[14px] font-semibold text-ink">{c.name}</div>
                <p className="mt-1 text-[12.5px] leading-snug text-fg-2">{c.plain}</p>
                <p className="mt-2 hidden break-words font-mono text-[10.5px] leading-snug text-muted group-hover:block">{c.detail}</p>
              </div>
            ))}
          </div>
        </section>
      )}
      <Marquee items={['Read-only', 'Fail closed', 'Count, never list', 'Keys expire', 'No network', 'Signed receipts', 'Humans approve exceptions']}
        className="rounded-[14px] bg-scarlet py-3 font-label text-[12px] font-bold uppercase tracking-[0.1em] text-paper" sep="✶" />
    </div>
  )
}

function Tile({ id, title, r, pending, active, fresh, onClick }: { id: string; title: string; r?: ThreatResult; pending: boolean; active: boolean; fresh: boolean; onClick: () => void }) {
  const state = !r ? 'idle' : r.outcome === 'blocked' ? 'blocked' : r.outcome === 'skipped' ? 'skipped' : r.cls === 'OK' && r.outcome === 'allowed' ? 'ok' : 'fail'
  return (
    <button onClick={onClick} data-cursor="big"
      className={clsx('relative min-h-[92px] overflow-hidden rounded-[12px] p-3 text-left transition duration-300 [transform-style:preserve-3d]',
        state === 'idle' && 'border-2 border-dashed border-line-strong bg-surface text-ink',
        state === 'blocked' && 'bg-ink text-paper',
        state === 'ok' && 'bg-good text-paper',
        state === 'skipped' && 'border-2 border-dashed border-line-strong bg-sunken text-muted',
        state === 'fail' && 'bg-scarlet text-paper',
        fresh && 'animate-[pop_.45s_both]', pending && 'animate-pulse', active && 'ring-4 ring-mustard')}>
      <div className="flex items-center justify-between font-mono text-[10.5px] opacity-80"><span>{id}</span>{r && <span>{r.ms}ms</span>}</div>
      <div className="mt-1.5 text-[12.5px] font-semibold leading-tight">{title}</div>
      {state !== 'idle' && (
        <span className={clsx('absolute bottom-2 right-2 rotate-[-8deg] rounded-[4px] border-2 px-1.5 py-0.5 font-label text-[9px] font-bold uppercase tracking-[0.1em]',
          state === 'blocked' && 'border-mustard text-mustard', state === 'ok' && 'border-paper text-paper',
          state === 'skipped' && 'border-muted text-muted', state === 'fail' && 'border-paper text-paper')}>
          {state === 'blocked' ? 'Blocked' : state === 'ok' ? 'Allowed' : state === 'skipped' ? 'Needs Docker' : 'Got through'}
        </span>
      )}
    </button>
  )
}

function Verdict({ r }: { r: ThreatResult }) {
  const good = r.passed
  return (
    <div className={clsx('rounded-[12px] px-4 py-3 font-display text-[22px]', r.outcome === 'skipped' ? 'bg-sunken text-muted' : good ? 'bg-ink text-mustard' : 'bg-scarlet text-paper')}>
      {r.outcome === 'skipped' ? 'Not fired: needs Docker' : r.cls === 'OK' ? (good ? 'Allowed, as it should be' : 'Wrongly blocked') : good ? 'Blocked' : 'Got through'}
    </div>
  )
}

function Gauge({ rate, tested, blocked, running, summary }: { rate: number; tested: number; blocked: number; running: boolean; summary: ThreatSummary | null }) {
  const R = 92, L = 2 * Math.PI * R * 0.75
  return (
    <div className="relative mx-auto grid h-[260px] w-[260px] place-items-center">
      <svg viewBox="0 0 240 240" className="absolute inset-0 h-full w-full rotate-[135deg]">
        <circle cx={120} cy={120} r={R} fill="none" stroke="rgb(234 230 227 / 0.12)" strokeWidth={20} strokeDasharray={`${L} 999`} strokeLinecap="round" />
        <circle cx={120} cy={120} r={R} fill="none" stroke={C.mustard} strokeWidth={20} strokeLinecap="round"
          strokeDasharray={`${L * rate} 999`} style={{ transition: 'stroke-dasharray .5s cubic-bezier(.2,.8,.2,1)' }} />
      </svg>
      <div className="text-center">
        <div className="font-display text-[64px] leading-none text-paper"><CountUp value={Math.round(rate * 100)} suffix="%" /></div>
        <div className="mt-2 font-label text-[10px] font-bold uppercase tracking-[0.14em] text-blush">{tested ? `${blocked} of ${tested} blocked` : running ? 'firing…' : 'block rate'}</div>
        {summary && <div className="mt-1 font-label text-[10px] uppercase tracking-[0.1em] text-paper/60">{summary.legit - summary.false_denials}/{summary.legit} normal requests allowed</div>}
      </div>
    </div>
  )
}

function Target({ label, goal, value, ok, note }: { label: React.ReactNode; goal: string; value: string; ok: boolean | null; note?: string }) {
  return (
    <div className="flex items-center gap-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium text-ink">{label}</div>
        <div className="font-label text-[10px] uppercase tracking-[0.08em] text-muted">target {goal}</div>
        {note && <div className="mt-1 text-[11.5px] text-warn">{note}</div>}
      </div>
      <div className="font-display text-[24px] text-ink">{value}</div>
      <span className={clsx('grid h-8 w-8 place-items-center rounded-full font-bold', ok == null ? 'bg-sunken text-muted' : ok ? 'bg-good text-paper' : 'bg-mustard text-ink')}>
        {ok == null ? '·' : ok ? '✓' : '!'}
      </span>
    </div>
  )
}

function SandboxPill({ sec, onRefresh }: { sec: SecurityStatus; onRefresh: () => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <button onClick={async () => { setBusy(true); try { await onRefresh() } finally { setBusy(false) } }}
      className={clsx('flex h-12 items-center gap-2 rounded-[12px] border-2 px-4 font-label text-[11px] font-bold uppercase tracking-[0.06em] transition',
        sec.sandbox.available ? 'border-good text-paper' : 'border-paper/30 text-paper/80 hover:border-paper')}>
      <span className={clsx('h-2.5 w-2.5 rounded-full', sec.sandbox.available ? 'bg-good' : 'animate-pulse bg-mustard')} />
      {busy ? 'Checking Docker…' : sec.sandbox.available ? 'Sandbox ready' : `Sandbox off: ${sec.sandbox.reason} · check again`}
    </button>
  )
}
