import { AlertTriangle, Archive, BellRing, CheckCircle2, Clock3, Flag, Hourglass, PackageX, RefreshCw, XCircle } from 'lucide-react'
import { cn } from '../../utils/format'

/**
 * One status language across admin + staff. Never colour-only:
 * every chip carries an icon (or live dot) and a text label.
 */
export const STATUS = {
  pending: { label: 'Pending', icon: Clock3, tone: 'pending' },
  waiting: { label: 'Waiting list', icon: Hourglass, tone: 'waiting' },
  ready: { label: 'Ready for approval', icon: BellRing, tone: 'ready' },
  approved: { label: 'Approved', icon: CheckCircle2, tone: 'approved' },
  live: { label: 'Live', icon: null, tone: 'live' },
  rejected: { label: 'Rejected', icon: XCircle, tone: 'rejected' },
  out_of_stock: { label: 'Out of stock', icon: PackageX, tone: 'oos' },
  closed: { label: 'Shelf closed', icon: Archive, tone: 'closed' },
}

export function StatusChip({ status, ready, size = 'md', className, label }) {
  const key = status === 'waiting' && ready ? 'ready' : status
  const cfg = STATUS[key] || STATUS.pending
  const Icon = cfg.icon
  return (
    <span className={cn('chip', `chip--${cfg.tone}`, size === 'sm' && 'chip--sm', className)}>
      {Icon ? <Icon size={size === 'sm' ? 12 : 13} aria-hidden strokeWidth={2.3} /> : <span className="live-dot" aria-hidden />}
      {label || cfg.label}
    </span>
  )
}

/** Shelf numbers render like warehouse bin labels. */
export function ShelfTag({ id, variant = 'solid', size = 'md', className, strike }) {
  return (
    <span className={cn('shelf-tag', `shelf-tag--${variant}`, size === 'lg' && 'shelf-tag--lg', size === 'sm' && 'shelf-tag--sm', strike && 'is-struck', className)}>
      <span className="sr-only">Shelf </span>
      {id}
    </span>
  )
}

export function SyncChip({ status }) {
  if (status === 'failed')
    return (
      <span className="sync sync--failed">
        <AlertTriangle size={13} aria-hidden /> Sync failed
      </span>
    )
  if (status === 'syncing')
    return (
      <span className="sync sync--syncing">
        <RefreshCw size={13} aria-hidden className="spin" /> Syncing
      </span>
    )
  if (!status) return <span className="sync sync--none">Not on Shopify</span>
  return (
    <span className="sync sync--ok">
      <CheckCircle2 size={13} aria-hidden /> Synced
    </span>
  )
}

export function CountBadge({ value, tone = 'neutral' }) {
  if (!value) return null
  return <span className={cn('count-badge', `count-badge--${tone}`)}>{value}</span>
}

/** Content-flag chips. Hold flags are solid; label-only flags are outlined. */
export function FlagChips({ flags = [], size = 'md', max = 3, reviewed }) {
  if (!flags.length) return null
  const shown = flags.slice(0, max)
  return (
    <span className="flagchips">
      {shown.map((f) => (
        <span key={f.id} className={cn('flagchip', f.mode === 'hold' && !reviewed ? 'flagchip--hold' : 'flagchip--label', size === 'sm' && 'flagchip--sm')} style={{ '--fh': f.hue ?? 285 }} title={`${f.name} · matched “${f.matched}” · ${f.mode === 'hold' ? 'hold for review' : 'label only'}`}>
          <Flag size={size === 'sm' ? 10 : 11} aria-hidden strokeWidth={2.5} />
          {f.name}
        </span>
      ))}
      {flags.length > max && <span className="flagchip flagchip--more">+{flags.length - max}</span>}
    </span>
  )
}
