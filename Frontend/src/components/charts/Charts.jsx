import { useState } from 'react'
import { cn, fmtNum, formatDate, weekday } from '../../utils/format'
import { ShelfTag } from '../ui/Status'

/** Daily bars — today highlighted in hero yellow, past days in ink. */
export function DayBars({ data, valueKey = 'count', height = 150, labelFmt = 'weekday', highlightLast = true, caption }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(1, ...data.map((d) => d[valueKey]))
  const ticks = niceTicks(max)
  return (
    <figure className="daybars" style={{ '--h': `${height}px` }}>
      <div className="daybars__grid" aria-hidden>
        {ticks.map((t) => (
          <span key={t} style={{ bottom: `${(t / ticks[ticks.length - 1]) * 100}%` }}>
            <em className="num">{t}</em>
          </span>
        ))}
      </div>
      <div className="daybars__cols">
        {data.map((d, i) => {
          const v = d[valueKey]
          const last = highlightLast && i === data.length - 1
          return (
            <div
              key={d.date}
              className={cn('daybars__col', last && 'is-today', hover === i && 'is-hover')}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
            >
              <div className="daybars__track">
                <span className="daybars__bar" style={{ height: `${(v / ticks[ticks.length - 1]) * 100}%` }}>
                  <span className="daybars__val num">{v}</span>
                </span>
              </div>
              <span className="daybars__lbl">{labelFmt === 'weekday' ? (last ? 'Today' : weekday(d.date)) : formatDate(d.date)}</span>
            </div>
          )
        })}
      </div>
      {caption && <figcaption className="sr-only">{caption}</figcaption>}
      <table className="sr-only">
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <td>{formatDate(d.date)}</td>
              <td>{d[valueKey]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

function niceTicks(max) {
  const step = max <= 5 ? 1 : max <= 10 ? 2 : max <= 25 ? 5 : max <= 50 ? 10 : Math.ceil(max / 5 / 10) * 10
  const top = Math.ceil(max / step) * step
  const out = []
  for (let t = 0; t <= top; t += step) out.push(t)
  return out
}

const STATUS_COLORS = {
  live: 'var(--success)',
  pending: 'var(--ink-2)',
  waiting: 'var(--hero)',
  out_of_stock: '#d9772b',
  rejected: 'var(--danger)',
}

/** Single horizontal stacked bar + legend — compact status breakdown. */
export function StatusBar({ items }) {
  const total = items.reduce((a, i) => a + i.count, 0) || 1
  return (
    <div className="statusbar">
      <div className="statusbar__track" role="img" aria-label={items.map((i) => `${i.label} ${i.count}`).join(', ')}>
        {items.map((i) =>
          i.count ? <span key={i.key} style={{ width: `${(i.count / total) * 100}%`, background: STATUS_COLORS[i.key] }} title={`${i.label}: ${i.count}`} /> : null,
        )}
      </div>
      <ul className="statusbar__legend">
        {items.map((i) => (
          <li key={i.key}>
            <span className="statusbar__swatch" style={{ background: STATUS_COLORS[i.key] }} aria-hidden />
            <span className="statusbar__label">{i.label}</span>
            <span className="statusbar__count num">{fmtNum(i.count)}</span>
            <span className="statusbar__pct num">{Math.round((i.count / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Shelf "rack" — horizontal fill per shelf, labelled with bin tags. */
export function ShelfBars({ shelves, valueKey = 'units', limit = 8, onSelect }) {
  const rows = shelves.slice(0, limit)
  const max = Math.max(1, ...rows.map((s) => s[valueKey]))
  return (
    <ul className="shelfbars">
      {rows.map((s) => (
        <li key={s.shelfId || s.id}>
          <button type="button" className="shelfbars__row" onClick={onSelect ? () => onSelect(s) : undefined} disabled={!onSelect}>
            <ShelfTag id={s.shelfId || s.id} size="sm" />
            <span className="shelfbars__track">
              <span className="shelfbars__fill" style={{ width: `${(s[valueKey] / max) * 100}%` }} />
            </span>
            <span className="shelfbars__val num">{s[valueKey]}</span>
            <span className="shelfbars__sub num">{s.titles} titles</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Multi-series line chart for reports (added / approved / rejected). */
export function LineChart({ data, series, height = 220 }) {
  const [hover, setHover] = useState(null)
  const W = 640
  const H = height
  const pad = { l: 28, r: 10, t: 12, b: 24 }
  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => d[s.key])))
  const ticks = niceTicks(max)
  const top = ticks[ticks.length - 1]
  const x = (i) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, data.length - 1)
  const y = (v) => pad.t + (1 - v / top) * (H - pad.t - pad.b)
  return (
    <div className="linechart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Trend chart" onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="linechart__grid" />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" className="linechart__tick">
              {t}
            </text>
          </g>
        ))}
        {data.map((d, i) =>
          i % Math.ceil(data.length / 7) === 0 || i === data.length - 1 ? (
            <text key={d.date} x={x(i)} y={H - 6} textAnchor="middle" className="linechart__tick">
              {formatDate(d.date)}
            </text>
          ) : null,
        )}
        {series.map((s) => (
          <polyline key={s.key} fill="none" stroke={s.color} strokeWidth={s.width || 2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dash} points={data.map((d, i) => `${x(i)},${y(d[s.key])}`).join(' ')} />
        ))}
        {data.map((d, i) => (
          <rect key={d.date} x={x(i) - (W / data.length) / 2} y={0} width={W / data.length} height={H} fill="transparent" onPointerEnter={() => setHover(i)} />
        ))}
        {hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} className="linechart__cursor" />
            {series.map((s) => (
              <circle key={s.key} cx={x(hover)} cy={y(data[hover][s.key])} r={3.5} fill="var(--surface)" stroke={s.color} strokeWidth={2} />
            ))}
          </g>
        )}
      </svg>
      <div className="linechart__legend">
        {series.map((s) => (
          <span key={s.key}>
            <i style={{ background: s.color }} aria-hidden />
            {s.label}
            {hover != null && <strong className="num">{data[hover][s.key]}</strong>}
          </span>
        ))}
        {hover != null && <span className="muted">{formatDate(data[hover].date, { weekday: 'short' })}</span>}
      </div>
    </div>
  )
}
