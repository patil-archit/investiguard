import clsx from 'clsx'
import { Check, Copy, Loader2 } from 'lucide-react'
import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import type { Status } from '../api'
import { Mascot } from './brand'

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('card', className)}>{children}</div>
}

export function PageHeader({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="relative flex flex-wrap items-end justify-between gap-6 border-b-2 border-ink pb-6">
      <div className="min-w-0">
        <h1 className="display animate-[rise_.7s_cubic-bezier(.2,.8,.2,1)_both] text-[clamp(40px,6.2vw,88px)] text-ink">{title}</h1>
        {sub && <p className="mt-4 max-w-3xl text-[14.5px] leading-relaxed text-fg-2">{sub}</p>}
      </div>
      {right}
    </div>
  )
}

/** Section heading. Icons are accepted for compatibility but no longer drawn. */
export function SectionTitle({ title, sub, right }: { icon?: ReactNode; title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div>
        <h2 className="display text-[19px] text-ink">{title}</h2>
        {sub && <p className="mt-1 font-label text-[10.5px] uppercase tracking-[0.08em] text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  )
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
export function Button({ variant = 'primary', loading, className, children, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={clsx(
        'inline-flex h-10 items-center justify-center gap-2 rounded-[10px] px-4 font-label text-[11.5px] font-bold uppercase tracking-[0.08em] transition active:translate-y-px',
        'disabled:cursor-not-allowed disabled:opacity-45 focus:outline-none focus-visible:ring-4 focus-visible:ring-mustard/50',
        variant === 'primary' && 'bg-ink text-paper shadow-[0_3px_0_var(--color-oxblood)] hover:bg-oxblood hover:shadow-[0_3px_0_var(--color-ink)]',
        variant === 'secondary' && 'border-[1.5px] border-ink bg-transparent text-ink hover:bg-ink hover:text-paper',
        variant === 'ghost' && 'text-muted hover:bg-sunken hover:text-fg',
        variant === 'danger' && 'border-[1.5px] border-scarlet/50 bg-transparent text-scarlet hover:bg-scarlet hover:text-paper',
        className,
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
}

const STATUS_STYLE: Record<string, string> = {
  SUPPORTED: 'bg-good text-paper',
  REJECTED: 'bg-scarlet text-paper',
  INCONCLUSIVE: 'bg-mustard text-ink',
  TESTING: 'bg-ink text-mustard',
  BLOCKED: 'bg-oxblood text-paper',
  PROPOSED: 'bg-sunken text-muted',
}

export function StatusBadge({ status }: { status: Status | string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-[5px] px-1.5 py-0.5 font-label text-[9.5px] font-bold uppercase tracking-[0.08em]',
      STATUS_STYLE[status] ?? STATUS_STYLE.PROPOSED)}>
      {status === 'TESTING' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-mustard" />}
      {status}
    </span>
  )
}

const SENS_STYLE: Record<string, string> = {
  public: 'text-muted bg-sunken',
  internal: 'text-ink bg-blush/50',
  confidential: 'text-warn bg-warn-soft',
  restricted: 'text-paper bg-scarlet',
}
export const sensitivityClass = (s: string) => SENS_STYLE[s] ?? SENS_STYLE.internal

export function Chip({ children, tone = 'default', mono }: { children: ReactNode; tone?: 'default' | 'warn' | 'accent'; mono?: boolean }) {
  return (
    <span className={clsx('inline-flex items-center rounded-[5px] px-1.5 py-0.5 text-[11px]',
      mono && 'font-mono',
      tone === 'default' && 'border border-line bg-sunken text-fg-2',
      tone === 'warn' && 'bg-warn-soft text-warn',
      tone === 'accent' && 'bg-accent-soft text-accent')}>
      {children}
    </span>
  )
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: 'good' | 'bad' | 'neutral' }) {
  return (
    <div className="bg-surface px-4 py-4">
      <div className="eyebrow">{label}</div>
      <div className={clsx('mt-2 font-display text-[26px] leading-none tabular-nums',
        tone === 'good' && 'text-good', tone === 'bad' && 'text-scarlet', (!tone || tone === 'neutral') && 'text-ink')}>
        {value}
      </div>
      {hint && <div className="mt-1.5 text-xs text-subtle">{hint}</div>}
    </div>
  )
}

export function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="group relative">
      <pre className="max-h-72 overflow-auto rounded-[12px] bg-ink p-4 font-mono text-[12px] leading-relaxed text-paper/90">
        {code}
      </pre>
      <button
        onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1200) }}
        className="absolute right-2 top-2 rounded-md bg-paper/10 p-1.5 text-paper/70 opacity-0 transition hover:text-mustard group-hover:opacity-100"
        title="Copy">
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}

/** Empty state; the robot stands in for an icon. */
export function Empty({ title, text }: { icon?: ReactNode; title: string; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[18px] border-2 border-dashed border-line-strong px-6 py-14 text-center">
      <Mascot size={92} mood="wow" className="mb-4 animate-bob" />
      <div className="display text-[20px] text-ink">{title}</div>
      <div className="mt-2 max-w-sm text-[13px] leading-relaxed text-muted">{text}</div>
    </div>
  )
}

export function ErrorNote({ error }: { error: string }) {
  return <div className="rounded-[12px] border-l-4 border-scarlet bg-bad-soft px-4 py-3 text-sm text-oxblood">{error}</div>
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer select-none items-center gap-2.5 text-sm text-fg-2">
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={clsx('relative h-[22px] w-10 shrink-0 rounded-full border-[1.5px] border-ink transition', checked ? 'bg-mustard' : 'bg-surface')}>
        <span className={clsx('absolute top-[2px] h-[15px] w-[15px] rounded-full bg-ink transition-all', checked ? 'left-[20px]' : 'left-[2px]')} />
      </button>
      {label}
    </label>
  )
}

/** Segmented control used for tabs and small toggles. */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-[10px] border-[1.5px] border-ink p-0.5">
      {options.map(o => (
        <button key={o.id} onClick={() => onChange(o.id)}
          className={clsx('rounded-[7px] px-3 py-1 font-label text-[10.5px] font-bold uppercase tracking-[0.06em] transition',
            value === o.id ? 'bg-ink text-paper' : 'text-muted hover:text-ink')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Shared chart styling so every Recharts chart matches the theme. */
export const CHART = {
  grid: '#ddd4cc',
  axis: { fill: '#776c63', fontSize: 11 },
  baseline: '#b9ada4',
  series: '#8b231a',
  tooltip: { background: '#f7f4f1', border: '1.5px solid #2d2a26', borderRadius: 10, fontSize: 12, boxShadow: '0 4px 0 rgb(45 42 38 / 0.15)' },
  cursor: { fill: 'rgb(227 168 152 / 0.18)' },
}

export const pct = (v: number, digits = 0) => `${(v * 100).toFixed(digits)}%`
