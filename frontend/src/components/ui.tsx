import clsx from 'clsx'
import { Check, Copy, Loader2 } from 'lucide-react'
import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import type { Status } from '../api'

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('card', className)}>{children}</div>
}

export function SectionTitle({ icon, title, sub, right }: { icon?: ReactNode; title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div className="flex items-center gap-2.5">
        {icon && <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/5 text-indigo-300">{icon}</span>}
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-slate-100">{title}</h2>
          {sub && <p className="text-xs text-slate-400">{sub}</p>}
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
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition',
        'disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-4',
        variant === 'primary' && 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/25 hover:from-indigo-400 hover:to-violet-400 focus-visible:ring-indigo-500/30',
        variant === 'secondary' && 'border border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08] focus-visible:ring-white/10',
        variant === 'ghost' && 'text-slate-300 hover:bg-white/5 hover:text-white',
        variant === 'danger' && 'border border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20 focus-visible:ring-rose-500/20',
        className,
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
}

const STATUS_STYLE: Record<string, string> = {
  SUPPORTED: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  REJECTED: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
  INCONCLUSIVE: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  TESTING: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  BLOCKED: 'bg-red-500/15 text-red-300 ring-red-500/30',
  PROPOSED: 'bg-slate-500/15 text-slate-300 ring-slate-500/30',
}

export function StatusBadge({ status }: { status: Status | string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1',
      STATUS_STYLE[status] ?? STATUS_STYLE.PROPOSED)}>
      {status === 'TESTING' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-300" />}
      {status}
    </span>
  )
}

const SENS_STYLE: Record<string, string> = {
  public: 'text-slate-300 bg-slate-500/10 ring-slate-500/25',
  internal: 'text-sky-300 bg-sky-500/10 ring-sky-500/25',
  confidential: 'text-amber-300 bg-amber-500/10 ring-amber-500/25',
  restricted: 'text-rose-300 bg-rose-500/10 ring-rose-500/25',
}
export const sensitivityClass = (s: string) => SENS_STYLE[s] ?? SENS_STYLE.internal

export function Chip({ children, tone = 'default', mono }: { children: ReactNode; tone?: 'default' | 'warn' | 'accent'; mono?: boolean }) {
  return (
    <span className={clsx('inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] ring-1',
      mono && 'font-mono',
      tone === 'default' && 'bg-white/[0.04] text-slate-300 ring-white/10',
      tone === 'warn' && 'bg-amber-500/10 text-amber-200 ring-amber-500/25',
      tone === 'accent' && 'bg-indigo-500/10 text-indigo-200 ring-indigo-500/25')}>
      {children}
    </span>
  )
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: 'good' | 'bad' | 'neutral' }) {
  return (
    <div className="card p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{label}</div>
      <div className={clsx('mt-1.5 text-2xl font-bold tracking-tight',
        tone === 'good' && 'text-emerald-300', tone === 'bad' && 'text-rose-300', (!tone || tone === 'neutral') && 'text-white')}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  )
}

export function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="group relative">
      <pre className="max-h-72 overflow-auto rounded-xl border border-white/[0.06] bg-ink-950/80 p-3.5 font-mono text-[12px] leading-relaxed text-sky-100/90">
        {code}
      </pre>
      <button
        onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1200) }}
        className="absolute right-2 top-2 rounded-lg border border-white/10 bg-ink-800 p-1.5 text-slate-400 opacity-0 transition hover:text-white group-hover:opacity-100"
        title="Copy">
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}

export function Empty({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 px-6 py-12 text-center">
      <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-white/5 text-slate-400">{icon}</div>
      <div className="text-sm font-semibold text-slate-200">{title}</div>
      <div className="mt-1 max-w-sm text-xs text-slate-500">{text}</div>
    </div>
  )
}

export function ErrorNote({ error }: { error: string }) {
  return <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer select-none items-center gap-3 text-sm text-slate-300">
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={clsx('relative h-5 w-9 shrink-0 rounded-full transition', checked ? 'bg-indigo-500' : 'bg-white/10')}>
        <span className={clsx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition', checked ? 'left-[18px]' : 'left-0.5')} />
      </button>
      {label}
    </label>
  )
}

export const pct = (v: number, digits = 0) => `${(v * 100).toFixed(digits)}%`
