import clsx from 'clsx'
import { useCallback, useEffect, useState } from 'react'
import { api, MODE_LABEL, MODE_PLAIN, type CompareRow, type Mode } from '../api'
import { go } from '../App'
import { Arrow, C, Mascot, Sticker } from '../components/brand'
import { Term } from '../components/gloss'
import { PrivilegeChart } from '../components/Insight'
import { CountUp } from '../components/studio'
import { Chip, pct } from '../components/ui'
import { useStore } from '../store'

const COLOR: Record<Mode, string> = { C: C.oxblood, B: C.tangerine, A: '#8f857c' }
const ORDER: Mode[] = ['C', 'B', 'A']

export default function Compare() {
  const { dataset, runs, setMode } = useStore()
  const [rows, setRows] = useState<CompareRow[]>([])
  const load = useCallback(() => { if (dataset) api.compare(dataset.name).then(setRows).catch(() => setRows([])) }, [dataset])
  useEffect(load, [load, runs])
  const by = Object.fromEntries(rows.map(r => [r.mode, r])) as Partial<Record<Mode, CompareRow>>
  const have = ORDER.filter(m => by[m])

  const metric = (name: React.ReactNode, f: (r: CompareRow) => number, fmt: (v: number) => string, lowGood = true) => ({ name, f, fmt, lowGood })
  const metrics = [
    metric(<Term t="data exposure">Columns read</Term>, r => r.exposure.columns_touched.length, v => String(v)),
    metric('Sensitive columns seen raw', r => r.exposure.sensitive_exposed_raw.length, v => String(v)),
    metric(<Term t="standing privilege">Standing privilege</Term>, r => Math.round(r.privilege?.column_seconds ?? 0), v => `${v} col·s`),
    metric('Time taken', r => r.seconds, v => `${v.toFixed(0)} s`),
    metric('Queries blocked', r => r.exposure.queries_denied, v => String(v), false),
  ]

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[26px] bg-blush px-5 pb-8 pt-8 sm:px-9">
        <Sticker r={-4} className="bg-ink text-paper">Three systems, one problem</Sticker>
        <h1 className="display mt-5 max-w-4xl text-[clamp(44px,6.4vw,96px)] text-paper">A vs B vs C</h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink">
          The synopsis compares three ways to let an AI investigate. Run the same problem with each (pick the system on the
          Investigate page) and see who reads less, risks less and still gets the answer.
        </p>
        <div className="mt-6 grid max-w-5xl gap-2 sm:grid-cols-3">
          {ORDER.map(m => (
            <div key={m} className="rounded-[16px] p-4 text-paper" style={{ background: COLOR[m] }}>
              <div className="flex items-baseline gap-2"><span className="font-display text-[30px] leading-none">{m}</span>
                <span className="font-label text-[11px] font-bold uppercase tracking-[0.08em]">{MODE_LABEL[m]}</span></div>
              <p className="mt-2 text-[12.5px] leading-snug opacity-85">{MODE_PLAIN[m]}</p>
              <button onClick={() => { setMode(m); go('investigate') }}
                className="mt-3 flex items-center gap-1 font-label text-[10.5px] font-bold uppercase tracking-[0.08em] underline underline-offset-4">
                {by[m] ? 'Run again' : 'Run it'} <Arrow className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
        <Mascot size={170} mood="wink" head={C.paper} className="absolute -right-6 top-6 hidden rotate-[14deg] lg:block" />
      </section>

      {have.length === 0 ? (
        <div className="rounded-[18px] border-2 border-dashed border-line-strong p-12 text-center text-[14px] text-muted">
          No runs yet on this dataset. Investigate a problem with System C, then the same problem with B and A.
        </div>
      ) : (
        <>
          {/* answers */}
          <div className={clsx('grid gap-4', have.length === 3 ? 'lg:grid-cols-3' : have.length === 2 ? 'lg:grid-cols-2' : '')}>
            {have.map(m => <Side key={m} r={by[m]!} />)}
          </div>

          {/* race bars */}
          <section className="card p-5 sm:p-6">
            <div className="font-label text-[9.5px] font-bold uppercase tracking-[0.14em] text-oxblood">the race</div>
            <h2 className="display mt-1 text-[24px] text-ink">Less is better</h2>
            <div className="mt-6 space-y-7">
              {metrics.map((mt, i) => {
                const vals = have.map(m => ({ m, v: mt.f(by[m]!) }))
                const max = Math.max(1, ...vals.map(x => x.v))
                const best = mt.lowGood ? Math.min(...vals.map(x => x.v)) : Math.max(...vals.map(x => x.v))
                return (
                  <div key={i}>
                    <div className="mb-2 text-[13px] font-semibold text-ink">{mt.name}</div>
                    <div className="space-y-1.5">
                      {vals.map(({ m, v }) => (
                        <div key={m} className="flex items-center gap-3">
                          <span className="w-6 font-display text-[16px]" style={{ color: COLOR[m] }}>{m}</span>
                          <div className="h-6 flex-1 overflow-hidden rounded-[7px] bg-sunken">
                            <div className="flex h-full items-center justify-end rounded-[7px] pr-2 transition-all duration-1000 ease-[cubic-bezier(.2,.8,.2,1)]"
                              style={{ width: `${Math.max(3, (v / max) * 100)}%`, background: COLOR[m] }}>
                              {v === best && vals.length > 1 && <span className="font-label text-[9px] font-bold uppercase text-paper">best</span>}
                            </div>
                          </div>
                          <span className="w-24 text-right font-mono text-[12px] text-ink">{mt.fmt(v)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {have.filter(m => by[m]!.privilege).length > 1 && (
            <section className="card p-5 sm:p-6">
              <div className="font-label text-[9.5px] font-bold uppercase tracking-[0.14em] text-oxblood">privilege over time</div>
              <h2 className="display mt-1 text-[24px] text-ink">How much was open, and for how long</h2>
              <p className="mt-1 text-[12.5px] text-muted">Columns open to the AI at each moment. The shaded area is the standing privilege: smaller is safer.</p>
              <div className="mt-4">
                <PrivilegeChart height={260} series={have.filter(m => by[m]!.privilege).map(m => ({ name: `${m} · ${MODE_LABEL[m]}`, privilege: by[m]!.privilege!, color: COLOR[m] }))} />
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function Side({ r }: { r: CompareRow }) {
  const m = r.mode as Mode
  return (
    <div className="flex flex-col overflow-hidden rounded-[20px] border-2 bg-surface" style={{ borderColor: COLOR[m] }}>
      <div className="flex items-center gap-2 px-5 py-3 text-paper" style={{ background: COLOR[m] }}>
        <span className="font-display text-[22px] leading-none">{m}</span>
        <span className="font-label text-[11px] font-bold uppercase tracking-[0.08em]">{MODE_LABEL[m]}</span>
        <span className="ml-auto font-mono text-[11px] opacity-80">{r.seconds}s</span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="font-label text-[9.5px] font-bold uppercase tracking-[0.12em] text-muted">its answer</div>
        <p className="mt-1 flex-1 text-[14px] leading-relaxed text-fg">{r.root_cause}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Mini label="Columns read" value={r.exposure.columns_touched.length} of={r.exposure.columns_total} />
          <Mini label="Exposure" value={Math.round(r.exposure.data_exposure_ratio * 100)} suffix="%" />
          <Mini label="Sensitive raw" value={r.exposure.sensitive_exposed_raw.length} bad={r.exposure.sensitive_exposed_raw.length > 0} />
          <div className={clsx('rounded-[12px] px-3 py-2.5', r.verified ? 'bg-good text-paper' : 'bg-scarlet text-paper')}>
            <div className="font-display text-[20px] leading-none">{r.verified ? 'Yes' : 'No'}</div>
            <div className="mt-1 font-label text-[9px] font-bold uppercase tracking-[0.1em]">checked by code</div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-1">{r.exposure.columns_touched.slice(0, 24).map(c => <Chip key={c} mono>{c.split('.').pop()}</Chip>)}</div>
        {r.exposure.data_exposure_ratio > 0 && <div className="mt-3 text-[11.5px] text-muted">{pct(r.exposure.data_exposure_ratio)} of the database was read.</div>}
      </div>
    </div>
  )
}

function Mini({ label, value, of, suffix, bad }: { label: string; value: number; of?: number; suffix?: string; bad?: boolean }) {
  return (
    <div className={clsx('rounded-[12px] px-3 py-2.5', bad ? 'bg-bad-soft' : 'bg-sunken')}>
      <div className={clsx('font-display text-[20px] leading-none', bad ? 'text-scarlet' : 'text-ink')}>
        <CountUp value={value} suffix={suffix} />{of != null && <span className="text-[13px] text-muted">/{of}</span>}
      </div>
      <div className="mt-1 font-label text-[9px] font-bold uppercase tracking-[0.1em] text-muted">{label}</div>
    </div>
  )
}
