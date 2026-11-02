import clsx from 'clsx'
import { Check, Copy, Loader2 } from 'lucide-react'
import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import type { Status } from '../api'

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('card', className)}>{children}</div>
}

export function PageHeader({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
      <div>
        <h1 className="text-[26px] font-semibold leading-tight text-fg">{title}</h1>
        {sub && <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  )
}

export function SectionTitle({ icon, title, sub, right }: { icon?: ReactNode; title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div className="flex items-center gap-2">
        {icon && <span className="text-subtle">{icon}</span>}
        <div>
          <h2 className="text-[14px] font-semibold text-fg">{title}</h2>
          {sub && <p className="text-xs text-muted">{sub}</p>}
        </div>
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
        'inline-flex h-9 items-center justify-center gap-2 rounded-md px-3.5 text-sm font-medium transition',
        'disabled:cursor-not-allowed disabled:opacity-45 focus:outline-none focus-visible:ring-3 focus-visible:ring-accent/25',
        variant === 'primary' && 'bg-fg text-canvas hover:bg-fg-2',
        variant === 'secondary' && 'border border-line-strong bg-surface text-fg hover:bg-sunken',
        variant === 'ghost' && 'text-muted hover:bg-sunken hover:text-fg',
        variant === 'danger' && 'border border-line-strong bg-surface text-bad hover:border-bad/40 hover:bg-bad-soft',
        className,
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
}

const STATUS_STYLE: Record<string, string> = {
  SUPPORTED: 'bg-good-soft text-good',
  REJECTED: 'bg-bad-soft text-bad',
  INCONCLUSIVE: 'bg-warn-soft text-warn',
  TESTING: 'bg-accent-soft text-accent',
  BLOCKED: 'bg-bad-soft text-bad',
  PROPOSED: 'bg-sunken text-muted',
}

export function StatusBadge({ status }: { status: Status | string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.05em]',
      STATUS_STYLE[status] ?? STATUS_STYLE.PROPOSED)}>
      {status === 'TESTING' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />}
      {status}
    </span>
  )
}

const SENS_STYLE: Record<string, string> = {
  public: 'text-muted bg-sunken',
  internal: 'text-accent bg-accent-soft',
  confidential: 'text-warn bg-warn-soft',
  restricted: 'text-bad bg-bad-soft',
}
export const sensitivityClass = (s: string) => SENS_STYLE[s] ?? SENS_STYLE.internal

export function Chip({ children, tone = 'default', mono }: { children: ReactNode; tone?: 'default' | 'warn' | 'accent'; mono?: boolean }) {
  return (
    <span className={clsx('inline-flex items-center rounded px-1.5 py-0.5 text-[11px]',
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
    <div className="bg-surface px-4 py-3.5">
      <div className="eyebrow">{label}</div>
      <div className={clsx('mt-1.5 text-[22px] font-semibold tabular-nums tracking-tight',
        tone === 'good' && 'text-good', tone === 'bad' && 'text-bad', (!tone || tone === 'neutral') && 'text-fg')}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-subtle">{hint}</div>}
    </div>
  )
}

export function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="group relative">
      <pre className="max-h-72 overflow-auto rounded-md border border-line bg-sunken p-3.5 font-mono text-[12px] leading-relaxed text-fg-2">
        {code}
      </pre>
      <button
        onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1200) }}
        className="absolute right-2 top-2 rounded border border-line bg-surface p-1.5 text-muted opacity-0 transition hover:text-fg group-hover:opacity-100"
        title="Copy">
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}

export function Empty({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line-strong px-6 py-14 text-center">
      <div className="mb-3 text-subtle">{icon}</div>
      <div className="text-sm font-medium text-fg">{title}</div>
      <div className="mt-1 max-w-sm text-xs leading-relaxed text-muted">{text}</div>
    </div>
  )
}

export function ErrorNote({ error }: { error: string }) {
  return <div className="rounded-md border border-bad/25 bg-bad-soft px-4 py-3 text-sm text-bad">{error}</div>
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer select-none items-center gap-2.5 text-sm text-fg-2">
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={clsx('relative h-[18px] w-8 shrink-0 rounded-full transition', checked ? 'bg-accent' : 'bg-line-strong')}>
        <span className={clsx('absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-all', checked ? 'left-[16px]' : 'left-0.5')} />
      </button>
      {label}
    </label>
  )
}

/** Segmented control used for tabs and small toggles. */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-md border border-line bg-sunken p-0.5">
      {options.map(o => (
        <button key={o.id} onClick={() => onChange(o.id)}
          className={clsx('rounded-[5px] px-3 py-1 text-xs font-medium transition',
            value === o.id ? 'bg-surface text-fg shadow-[0_1px_2px_rgb(27_26_24/0.08)]' : 'text-muted hover:text-fg')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Shared chart styling so every Recharts chart matches the theme. */
export const CHART = {
  grid: '#ebe9e4',
  axis: { fill: '#8a877f', fontSize: 11 },
  baseline: '#cfcbc2',
  series: '#11607a',
  tooltip: { background: '#ffffff', border: '1px solid #e5e3de', borderRadius: 6, fontSize: 12, boxShadow: '0 4px 16px rgb(27 26 24 / 0.08)' },
  cursor: { fill: 'rgb(27 26 24 / 0.03)' },
}

export const pct = (v: number, digits = 0) => `${(v * 100).toFixed(digits)}%`
