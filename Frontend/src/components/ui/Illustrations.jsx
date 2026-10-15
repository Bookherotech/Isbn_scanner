/**
 * Small line illustrations for empty states — ink strokes with a single
 * hero-yellow accent, echoing the logo. Kept inline for zero network cost.
 */
const S = { fill: 'none', stroke: 'var(--ink)', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }
const Y = 'var(--hero)'

const ART = {
  books: (
    <>
      <path d="M14 70h92" {...S} />
      <rect x="24" y="26" width="14" height="44" rx="1.5" fill={Y} {...S} />
      <rect x="38" y="32" width="12" height="38" rx="1.5" fill="var(--surface)" {...S} />
      <rect x="50" y="22" width="16" height="48" rx="1.5" fill="var(--surface)" {...S} />
      <path d="M54 30h8M54 34h8" {...S} />
      <rect x="70" y="40" width="12" height="30" rx="1.5" transform="rotate(-14 76 55)" fill="var(--paper-2)" {...S} />
      <path d="M90 52l4-6 4 6M94 46v12" {...S} opacity=".35" />
    </>
  ),
  shelf: (
    <>
      <rect x="18" y="16" width="84" height="56" rx="2" fill="var(--surface)" {...S} />
      <path d="M18 44h84" {...S} />
      <rect x="26" y="24" width="8" height="20" fill={Y} {...S} />
      <rect x="34" y="27" width="7" height="17" fill="var(--paper-2)" {...S} />
      <path d="M26 64h20M60 34h30" {...S} strokeDasharray="3 4" opacity=".5" />
      <rect x="72" y="50" width="18" height="8" rx="1" fill={Y} {...S} />
    </>
  ),
  bell: (
    <>
      <path d="M60 18c-12 0-20 9-20 21v13l-6 8h52l-6-8V39c0-12-8-21-20-21z" fill="var(--surface)" {...S} />
      <path d="M53 66a7 7 0 0014 0" {...S} />
      <path d="M86 26l6-4M88 38h7M34 26l-6-4M32 38h-7" {...S} opacity=".45" />
      <circle cx="60" cy="40" r="4" fill={Y} {...S} />
    </>
  ),
  search: (
    <>
      <rect x="20" y="24" width="50" height="34" rx="2" fill="var(--surface)" {...S} />
      <path d="M28 32v18M32 32v18M35 32v18M40 32v18M43 32v18M48 32v18M52 32v18M55 32v18M60 32v18" {...S} strokeWidth="1.4" />
      <circle cx="74" cy="52" r="13" fill="var(--hero-subtle)" {...S} />
      <path d="M83 61l12 12" {...S} strokeWidth="3" />
    </>
  ),
  check: (
    <>
      <rect x="32" y="18" width="40" height="54" rx="2" fill="var(--surface)" {...S} />
      <path d="M40 30h24M40 38h18" {...S} opacity=".4" />
      <circle cx="74" cy="58" r="15" fill={Y} {...S} />
      <path d="M67 58l5 5 9-10" {...S} strokeWidth="2.2" />
    </>
  ),
  activity: (
    <>
      <path d="M26 20v54" {...S} />
      <circle cx="26" cy="28" r="4" fill={Y} {...S} />
      <circle cx="26" cy="48" r="4" fill="var(--surface)" {...S} />
      <circle cx="26" cy="66" r="4" fill="var(--surface)" {...S} />
      <path d="M38 28h50M38 48h38M38 66h44" {...S} opacity=".45" />
    </>
  ),
}

export function Illustration({ name = 'books', size = 120 }) {
  return (
    <svg className="illustration" width={size} height={size * 0.75} viewBox="0 0 120 90" aria-hidden>
      {ART[name] || ART.books}
    </svg>
  )
}
