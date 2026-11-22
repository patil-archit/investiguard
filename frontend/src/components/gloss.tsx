/** Plain-language glossary: hover (or tap) any dotted term to see what it means. */
import clsx from 'clsx'
import { useState, type ReactNode } from 'react'

export const GLOSSARY: Record<string, string> = {
  hypothesis: 'A guess about why the number moved, such as "orders from the West region dropped". Each one is tested separately.',
  capability: 'A permission key. It lets the AI read a few named columns for a short time, for one guess only, then it is destroyed.',
  'policy engine': 'Plain code (not AI) that decides whether a key may be issued. It checks five rules, P1 to P5.',
  gateway: 'A checkpoint every database query must pass. It takes the query apart and checks each column against the key.',
  'evidence engine': 'Statistics code that decides if a guess is supported or rejected. The AI is not allowed to grade itself.',
  sandbox: 'A sealed box (a Docker container) where AI-written code runs with no internet, no passwords and no way to change files.',
  'prompt injection': 'Text hidden inside the data that tries to give the AI orders, like "ignore your rules".',
  firewall: 'Code that blanks out instruction-like text in query results before the AI sees it.',
  receipt: 'A tamper-evident record of everything the AI touched. Change one entry and the seal breaks.',
  'standing privilege': 'Access that stays open whether or not it is being used. Less of it means less damage if something goes wrong.',
  'data exposure': 'The share of all the columns in the database that the AI actually read.',
  'explained share': 'How much of the total change one cause accounts for. 80% means that cause alone covers four-fifths of it.',
  lift: 'How much more a segment moved than its size would suggest. Above 1.5× means it stands out.',
  'evidence score': 'The synopsis score 0.5·E + 0.3·S + 0.2·T: how much it explains (E), how unusual it is (S), and whether the timing lines up (T).',
  'count-only': 'A sensitive column the AI may count but never read. It can learn "120 customers" but not who they are.',
  'evidence gate': 'Rule P4: sensitive tables, like deployment logs, open only after something else has been proven first.',
  'System A': 'The AI gets the whole database for the whole run and judges its own answer.',
  'System B': 'The AI gets a few whole tables chosen up front, for the whole run, and judges its own answer.',
  'System C': 'InvestiGuard: one guess at a time, a few columns per guess, code judges, keys destroyed after each test.',
  'permission precision': 'Of all the columns the AI was allowed to read, the share it really needed.',
  'permission recall': 'Of the columns it really needed, the share it was allowed to read.',
  'block rate': 'Of all the attacks tried, the share that were stopped.',
  'false denial': 'A legitimate request that was wrongly blocked.',
  TTL: 'Time to live: how many seconds a key works before it expires by itself.',
}

export function Term({ t, children, className }: { t: keyof typeof GLOSSARY | string; children?: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false)
  const def = GLOSSARY[t] ?? GLOSSARY[t.toLowerCase()]
  if (!def) return <>{children ?? t}</>
  return (
    <span className={clsx('relative inline-block', className)} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="cursor-help border-b-2 border-dotted border-current/50 leading-tight">{children ?? t}</button>
      {open && (
        <span role="tooltip" className="absolute bottom-full left-1/2 z-40 mb-2 w-64 -translate-x-1/2 animate-[pop_.25s_both] rounded-[12px] bg-ink px-3.5 py-3 text-left font-sans text-[12.5px] font-normal normal-case leading-snug tracking-normal text-paper shadow-[0_6px_0_rgb(45_42_38/0.2)]">
          <span className="mb-1 block font-label text-[9.5px] font-bold uppercase tracking-[0.12em] text-mustard">{t}</span>
          {def}
        </span>
      )}
    </span>
  )
}
