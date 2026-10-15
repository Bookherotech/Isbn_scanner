import { useEffect, useState } from 'react'

/**
 * Launch splash — plays once per browser session (append ?splash to replay).
 * Logo lands with the lightning sweep, the wordmark stamps in, a shelf of
 * book spines rises and the barcode laser runs across it. Tap to skip.
 */
const KEY = 'bookhero.splashSeen'
const SPINES = [
  { h: 34, c: '#1f3b2d' },
  { h: 42, c: '#6d1f22' },
  { h: 30, c: '#e9b730' },
  { h: 46, c: '#1d2b4a' },
  { h: 38, c: '#2f5d62' },
  { h: 28, c: '#b4532a' },
  { h: 44, c: '#f6d23a' },
  { h: 36, c: '#5b3a5e' },
  { h: 40, c: '#4f5d2f' },
  { h: 32, c: '#efe6d2' },
]
const WORD = '#BookHero'.split('')

function shouldShow() {
  try {
    if (new URLSearchParams(window.location.search).has('splash')) return true
    return sessionStorage.getItem(KEY) !== '1'
  } catch {
    return true
  }
}

export function Splash() {
  const [phase, setPhase] = useState(shouldShow() ? 'in' : 'done')

  useEffect(() => {
    if (phase !== 'in') return
    try {
      sessionStorage.setItem(KEY, '1')
    } catch {
      /* ignore */
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const t = setTimeout(() => setPhase('out'), reduce ? 700 : 2700)
    return () => clearTimeout(t)
  }, [phase])

  useEffect(() => {
    if (phase !== 'out') return
    const t = setTimeout(() => setPhase('done'), 520)
    return () => clearTimeout(t)
  }, [phase])

  if (phase === 'done') return null

  return (
    <div className={`splash is-${phase}`} role="status" aria-label="Loading BookHero" onClick={() => setPhase('out')}>
      <div className="splash__bolt" aria-hidden />
      <div className="splash__center">
        <div className="splash__logo-wrap" aria-hidden>
          <span className="splash__ring" />
          <span className="splash__ring splash__ring--2" />
          <img src="/logo-512.webp" className="splash__logo" width={156} height={156} alt="" />
        </div>
        <div className="splash__word" aria-hidden>
          {WORD.map((ch, i) => (
            <span key={i} className={ch === '#' ? 'is-hash' : undefined} style={{ '--i': i }}>
              {ch}
            </span>
          ))}
        </div>
        <p className="splash__tag">Scan · Shelve · Go live</p>
        <div className="splash__shelf" aria-hidden>
          {SPINES.map((s, i) => (
            <i key={i} style={{ '--i': i, '--sh': `${s.h}px`, '--c': s.c }} />
          ))}
          <span className="splash__laser" />
        </div>
        <div className="splash__bar" aria-hidden>
          <span />
        </div>
      </div>
      <span className="splash__skip">Tap to skip</span>
    </div>
  )
}
