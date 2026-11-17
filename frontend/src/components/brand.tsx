/** Brand pieces: the robot mascot, logo lockup, marquees, stickers, rotating badge, custom cursor, preloader. */
import clsx from 'clsx'
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'

export const C = {
  paper: '#EAE6E3', blush: '#E3A898', scarlet: '#D32929', oxblood: '#8B231A',
  tangerine: '#F45016', mustard: '#EFC415', ink: '#2D2A26',
}

type Mood = 'happy' | 'wow' | 'cool' | 'x' | 'wink' | 'sleepy'

/** The robot. Eyes follow the pointer when `track` is on and blink on their own. */
export function Mascot({ size = 160, className, style, mood = 'happy', track = true, head = C.paper, visor = C.ink,
  glow = C.mustard, ball = C.tangerine, stroke = C.ink }: {
  size?: number; className?: string; style?: CSSProperties; mood?: Mood; track?: boolean
  head?: string; visor?: string; glow?: string; ball?: string; stroke?: string
}) {
  const eyes = useRef<SVGGElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  useEffect(() => {
    if (!track) return
    let raf = 0
    const on = (e: PointerEvent) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const r = svg.current?.getBoundingClientRect()
        if (!r || !eyes.current) return
        const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height * 0.6)
        const d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 400)
        eyes.current.style.transform = `translate(${(dx / d) * 7 * k}px, ${(dy / d) * 5 * k}px)`
      })
    }
    window.addEventListener('pointermove', on)
    return () => { window.removeEventListener('pointermove', on); cancelAnimationFrame(raf) }
  }, [track])
  const sw = 6
  return (
    <svg ref={svg} viewBox="0 0 200 170" width={size} height={size * 0.85} className={className} style={style} aria-hidden>
      {/* antenna */}
      <path d="M90 62 L100 26 L110 62" fill="none" stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
      <circle cx="100" cy="22" r="12" fill={ball} stroke={stroke} strokeWidth={sw} />
      {/* ears */}
      <rect x="14" y="88" width="26" height="46" rx="13" fill={head} stroke={stroke} strokeWidth={sw} />
      <rect x="160" y="88" width="26" height="46" rx="13" fill={head} stroke={stroke} strokeWidth={sw} />
      {/* head */}
      <rect x="30" y="60" width="140" height="104" rx="50" fill={head} stroke={stroke} strokeWidth={sw} />
      {/* visor */}
      <rect x="48" y="76" width="104" height="72" rx="32" fill={visor} />
      <g ref={eyes} style={{ transition: 'transform .12s ease-out' }}>
        {mood === 'x' ? (
          <g stroke={glow} strokeWidth="6" strokeLinecap="round">
            <path d="M72 98 l14 14 M86 98 l-14 14" /><path d="M114 98 l14 14 M128 98 l-14 14" />
          </g>
        ) : mood === 'cool' ? (
          <g>
            <rect x="60" y="96" width="34" height="18" rx="8" fill={glow} />
            <rect x="106" y="96" width="34" height="18" rx="8" fill={glow} />
            <rect x="92" y="101" width="16" height="5" fill={glow} />
          </g>
        ) : mood === 'sleepy' ? (
          <g stroke={glow} strokeWidth="6" strokeLinecap="round"><path d="M70 106 h18 M112 106 h18" /></g>
        ) : (
          <g className="animate-blink" style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
            <ellipse cx="80" cy="105" rx="9" ry="10.5" fill={glow} />
            {mood === 'wink'
              ? <path d="M111 106 q9 -8 18 0" fill="none" stroke={glow} strokeWidth="6" strokeLinecap="round" />
              : <ellipse cx="120" cy="105" rx="9" ry="10.5" fill={glow} />}
          </g>
        )}
        {mood === 'wow'
          ? <ellipse cx="100" cy="130" rx="7" ry="8" fill={glow} />
          : <path d="M88 126 Q100 137 112 126" fill="none" stroke={glow} strokeWidth="6" strokeLinecap="round" />}
      </g>
    </svg>
  )
}

/** Tiny mono-colour robot head for inline use, in place of generic "bot" icons. */
export function BotMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden>
      <path d="M10.5 7.5 12 3.5l1.5 4" /><circle cx="12" cy="3" r="1.4" fill="currentColor" />
      <rect x="3.5" y="7.5" width="17" height="13" rx="6" /><circle cx="9.3" cy="13.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="14.7" cy="13.5" r="1.3" fill="currentColor" stroke="none" /><path d="M10 16.6q2 1.4 4 0" strokeLinecap="round" />
    </svg>
  )
}

/** Mascot + wordmark, styled like a printed badge lockup. */
export function Logo({ className, light }: { className?: string; light?: boolean }) {
  const ink = light ? C.paper : C.ink
  return (
    <span className={clsx('flex items-center gap-2', className)} style={{ color: ink }}>
      <Mascot size={38} track={false} stroke={ink} />
      <span className="flex flex-col items-center leading-none">
        <span className="display text-[17px] tracking-[0.01em]">Investi<span className="text-oxblood" style={light ? { color: C.mustard } : undefined}>Guard</span></span>
        <span className="mt-[3px] flex items-center gap-1 font-label text-[6.5px] font-bold uppercase tracking-[0.18em] opacity-80">
          <span className="h-px w-3 bg-current" />least privilege<span className="h-px w-3 bg-current" />
        </span>
      </span>
    </span>
  )
}

/** Infinite horizontal ticker. */
export function Marquee({ items, className, reverse, sep = '●', speed }: {
  items: ReactNode[]; className?: string; reverse?: boolean; sep?: ReactNode; speed?: number
}) {
  const row = (k: string) => (
    <div key={k} className="flex shrink-0 items-center" aria-hidden={k === 'b'}>
      {items.map((it, i) => <span key={i} className="flex items-center whitespace-nowrap px-6">{it}<span className="ml-12 text-[0.6em] opacity-70">{sep}</span></span>)}
    </div>
  )
  return (
    <div className={clsx('flex overflow-hidden', className)}>
      <div className={clsx('flex w-max', reverse ? 'animate-marquee-rev' : 'animate-marquee')} style={speed ? { animationDuration: `${speed}s` } : undefined}>
        {row('a')}{row('b')}
      </div>
    </div>
  )
}

export function Sticker({ children, r = -4, className, style }: { children: ReactNode; r?: number; className?: string; style?: CSSProperties }) {
  return <span className={clsx('sticker', className)} style={{ ['--r' as string]: `${r}deg`, ...style }}>{children}</span>
}

/** Circular text badge that spins; the centre takes any content. */
export function SpinBadge({ text, size = 132, className, onClick, color = C.ink, fill = 'transparent', children }: {
  text: string; size?: number; className?: string; onClick?: () => void; color?: string; fill?: string; children?: ReactNode
}) {
  const id = `sb${useId().replace(/:/g, '')}`
  return (
    <button type="button" onClick={onClick} data-cursor="big"
      className={clsx('group relative grid place-items-center rounded-full transition-transform duration-300 hover:scale-110', className)}
      style={{ width: size, height: size, color }}>
      <svg viewBox="0 0 120 120" className="absolute inset-0 h-full w-full animate-spin-slow group-hover:[animation-duration:4s]">
        <circle cx="60" cy="60" r="58" fill={fill} stroke="currentColor" strokeWidth="2" />
        <path id={id} d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0" fill="none" />
        <text fill="currentColor" style={{ fontFamily: 'var(--font-label)', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.2em' }}>
          <textPath href={`#${id}`}>{text}</textPath>
        </text>
      </svg>
      <span className="relative">{children}</span>
    </button>
  )
}

export function Arrow({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 19 19 5M8 5h11v11" />
    </svg>
  )
}

/** Ink dot + ring that follows the pointer; the ring grows over anything clickable. */
export function Cursor() {
  const dot = useRef<HTMLDivElement>(null)
  const ring = useRef<HTMLDivElement>(null)
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches) return
    setOn(true)
    document.documentElement.classList.add('has-cursor')
    let x = innerWidth / 2, y = innerHeight / 2, rx = x, ry = y, raf = 0, big = false
    const move = (e: PointerEvent) => {
      x = e.clientX; y = e.clientY
      const t = e.target as HTMLElement | null
      big = !!t?.closest('a,button,[role=button],select,label,[data-cursor]')
    }
    const loop = () => {
      rx += (x - rx) * 0.2; ry += (y - ry) * 0.2
      if (dot.current) dot.current.style.transform = `translate(${x}px, ${y}px)`
      if (ring.current) ring.current.style.transform = `translate(${rx}px, ${ry}px) scale(${big ? 1.9 : 1})`
      raf = requestAnimationFrame(loop)
    }
    window.addEventListener('pointermove', move)
    raf = requestAnimationFrame(loop)
    return () => { window.removeEventListener('pointermove', move); cancelAnimationFrame(raf); document.documentElement.classList.remove('has-cursor') }
  }, [])
  if (!on) return null
  return (
    <>
      <div ref={dot} className="pointer-events-none fixed left-0 top-0 z-[100] -ml-[3px] -mt-[3px] h-1.5 w-1.5 rounded-full bg-ink" />
      <div ref={ring} className="pointer-events-none fixed left-0 top-0 z-[100] -ml-4 -mt-4 h-8 w-8 rounded-full border-[1.5px] border-ink mix-blend-difference transition-[width,height] duration-200" style={{ borderColor: C.paper }} />
    </>
  )
}

/** First-visit loader: counter, logo, and robots peeking from the corners. */
export function Preloader({ onDone }: { onDone: () => void }) {
  const [n, setN] = useState(0)
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    const t0 = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 1300)
      setN(Math.round((1 - Math.pow(1 - p, 3)) * 100))
      if (p < 1) raf = requestAnimationFrame(tick)
      else setTimeout(() => { setLeaving(true); setTimeout(onDone, 700) }, 180)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [onDone])
  const corner = (cls: string, rot: number, mood: Mood, props: Partial<Parameters<typeof Mascot>[0]>) => (
    <div className={clsx('absolute transition-transform duration-700', cls)} style={{ transform: `rotate(${rot}deg)` }}>
      <Mascot size={210} mood={mood} {...props} />
    </div>
  )
  return (
    <div className={clsx('fixed inset-0 z-[95] overflow-hidden border-[10px] border-blush bg-paper transition-transform duration-700 ease-[cubic-bezier(.7,0,.2,1)]',
      leaving && '-translate-y-full')}>
      {corner('-left-16 -top-10', 135, 'cool', { head: C.tangerine, visor: C.oxblood })}
      {corner('-right-16 -top-10', -135, 'wink', { head: C.mustard })}
      {corner('-left-16 -bottom-14', 35, 'wow', { head: C.blush })}
      {corner('-right-16 -bottom-14', -35, 'happy', { head: C.scarlet, glow: C.paper })}
      <div className="absolute inset-0 grid place-items-center"><Logo className="scale-150" /></div>
      <div className="absolute inset-x-0 bottom-10 text-center font-display text-3xl text-ink">{n}%</div>
    </div>
  )
}

/** Sets `--s` on the element: how many viewport-heights it has scrolled past its top (can be negative). */
export function useScrollVar(ref: React.RefObject<HTMLElement | null>, name = '--s', mode: 'vh' | 'progress' = 'vh') {
  useEffect(() => {
    let raf = 0
    const update = () => {
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const v = mode === 'vh' ? -r.top / innerHeight : Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - innerHeight)))
      el.style.setProperty(name, v.toFixed(4))
    }
    const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); cancelAnimationFrame(raf) }
  }, [ref, name, mode])
}

/** True once the element has entered the viewport. */
export function useInView<T extends HTMLElement>(threshold = 0.25) {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect() } }, { threshold })
    io.observe(el)
    return () => io.disconnect()
  }, [threshold])
  return [ref, seen] as const
}

/** Fade-and-rise wrapper triggered when scrolled into view. */
export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const [ref, seen] = useInView<HTMLDivElement>(0.15)
  return (
    <div ref={ref} className={className}
      style={{ opacity: seen ? 1 : 0, transform: seen ? 'none' : 'translateY(40px)', transition: `opacity .8s ${delay}ms cubic-bezier(.2,.8,.2,1), transform .8s ${delay}ms cubic-bezier(.2,.8,.2,1)` }}>
      {children}
    </div>
  )
}
