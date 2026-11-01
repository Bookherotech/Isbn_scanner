import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, BellRing, CheckCheck, CheckCircle2, ChevronRight, Flag, Hourglass, Inbox, PackageCheck, PackageX, RefreshCcw, TriangleAlert, XCircle } from 'lucide-react'
import { getNotifications, markAllNotificationsRead, markNotificationRead } from '../../services/notificationApi'
import { useQuery, useTicker } from '../../hooks/useStore'
import { useUnreadCount } from '../../hooks/useUnreadCount'
import { Segmented } from '../ui/Form'
import { Button } from '../ui/Button'
import { EmptyState, ErrorState, Skeleton } from '../ui/Feedback'
import { ShelfTag } from '../ui/Status'
import { clockNow, cn, formatDateTime, timeAgo } from '../../utils/format'

export const NOTIF_META = {
  stock_out: { icon: PackageX, label: 'Stock out', tone: 'oos' },
  stock_out_reminder: { icon: RefreshCcw, label: '24 h reminder', tone: 'oos' },
  waiting_ready: { icon: BellRing, label: 'Waiting list ready', tone: 'ready' },
  waiting_created: { icon: Hourglass, label: 'Waiting list', tone: 'waiting' },
  waiting_approved: { icon: PackageCheck, label: 'Back in stock', tone: 'live' },
  new_submission: { icon: Inbox, label: 'New submission', tone: 'pending' },
  approved: { icon: CheckCircle2, label: 'Approved', tone: 'live' },
  rejected: { icon: XCircle, label: 'Rejected', tone: 'rejected' },
  sync_failed: { icon: TriangleAlert, label: 'Shopify sync', tone: 'rejected' },
  flagged: { icon: Flag, label: 'Content flag', tone: 'flag' },
}

function linkFor(n, role) {
  if (role === 'staff') return n.itemId ? `/staff/submissions/${n.itemId}` : '/staff/submissions'
  switch (n.type) {
    case 'stock_out':
    case 'stock_out_reminder':
      return '/admin/waiting-list?tab=stock'
    case 'waiting_ready':
    case 'waiting_created':
      return '/admin/waiting-list'
    case 'new_submission':
    case 'flagged':
      return n.itemId ? `/admin/pending/${n.itemId}` : '/admin/pending'
    case 'sync_failed':
      return '/admin/live'
    default:
      return n.itemId ? `/admin/books/${n.itemId}` : '/admin'
  }
}

const ACTION = {
  stock_out: 'View stock',
  stock_out_reminder: 'View stock',
  waiting_ready: 'Review entry',
  waiting_created: 'Open list',
  new_submission: 'Review',
  flagged: 'Review',
  sync_failed: 'Check sync',
}

const DAY_MS = 24 * 60 * 60 * 1000
const startOfDay = (ms) => new Date(ms).setHours(0, 0, 0, 0)

function dayLabel(at) {
  const days = Math.round((startOfDay(clockNow()) - startOfDay(at)) / DAY_MS)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return new Date(at).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })
}

/** Notifications grouped by day, newest day first: [{ label, items }]. */
function byDay(rows) {
  const groups = []
  for (const n of rows) {
    const label = dayLabel(n.at)
    if (groups.at(-1)?.label === label) groups.at(-1).items.push(n)
    else groups.push({ label, items: [n] })
  }
  return groups
}

/** The body text with book titles in bold and shelf codes as shelf tags. */
function richBody(text) {
  return text.split(/(\u201c[^\u201d]+\u201d|\b[A-Z]-\d{2}\b)/).map((part, i) => {
    if (/^\u201c/.test(part)) return <strong key={i}>{part}</strong>
    if (/^[A-Z]-\d{2}$/.test(part)) return <ShelfTag key={i} id={part} size="sm" />
    return part
  })
}

function AdminSummary({ marking, onMarkAll }) {
  const unread = useUnreadCount()
  return (
    <div className="feed-summary">
      <span className="feed-summary__bell">
        <Bell size={22} aria-hidden strokeWidth={2.2} />
      </span>
      <div className="feed-summary__text">
        <strong>{unread > 0 ? `${unread} unread` : 'You\u2019re all caught up'}</strong>
        <span>{unread > 0 ? 'Open one to act on it. It is marked read as you go.' : 'New stock and submission updates will appear here.'}</span>
      </div>
      {unread > 0 && (
        <Button icon={CheckCheck} loading={marking} onClick={onMarkAll}>
          Mark all read
        </Button>
      )}
    </div>
  )
}

function AdminCard({ n, onOpen }) {
  const meta = NOTIF_META[n.type] || NOTIF_META.new_submission
  const Icon = meta.icon
  return (
    <li>
      <button className={cn('feed-card', !n.read && 'is-unread')} onClick={onOpen}>
        <span className={cn('feed-card__icon', 'feed__icon', `feed__icon--${meta.tone}`)}>
          <Icon size={20} aria-hidden strokeWidth={2.1} />
        </span>
        <span className="feed-card__text">
          <span className="feed-card__type">
            {meta.label}
            {!n.read && <span className="feed-card__dot" aria-label="Unread" />}
          </span>
          <span className="feed-card__body">{richBody(n.body)}</span>
        </span>
        <span className="feed-card__side">
          <time dateTime={new Date(n.at).toISOString()} title={formatDateTime(n.at)}>
            {timeAgo(n.at)}
          </time>
          <span className="feed-card__action">
            {ACTION[n.type] || 'View book'} <ChevronRight size={14} aria-hidden strokeWidth={2.4} />
          </span>
        </span>
      </button>
    </li>
  )
}

export function NotificationFeed({ user, variant = 'admin' }) {
  const [filter, setFilter] = useState('all')
  const { data, loading, error, reload } = useQuery(() => getNotifications(user, { filter }), [user.id, filter])
  const navigate = useNavigate()
  const [marking, setMarking] = useState(false)
  useTicker()

  const unread = data?.filter((n) => !n.read).length ?? 0
  const markAll = async () => {
    setMarking(true)
    await markAllNotificationsRead(user)
    setMarking(false)
  }
  const options =
    variant === 'admin'
      ? [
          { value: 'all', label: 'All' },
          { value: 'unread', label: 'Unread' },
          { value: 'stock', label: 'Stock' },
          { value: 'waiting', label: 'Waiting list' },
          { value: 'submissions', label: 'Submissions' },
          { value: 'flags', label: 'Flags' },
        ]
      : [
          { value: 'all', label: 'All' },
          { value: 'unread', label: 'Unread' },
          { value: 'stock', label: 'Stock' },
        ]

  return (
    <div className={cn('feed', `feed--${variant}`)}>
      {variant === 'admin' && <AdminSummary marking={marking} onMarkAll={markAll} />}
      <div className="feed__bar">
        <Segmented options={options} value={filter} onChange={setFilter} label="Filter notifications" />
        {variant !== 'admin' && (
          <Button variant="ghost" size="sm" icon={CheckCheck} loading={marking} onClick={markAll}>
            Mark all read
          </Button>
        )}
      </div>
      {loading ? (
        <ul className="feed__list" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="feed__item feed__item--skeleton">
              <Skeleton w={34} h={34} r={8} />
              <span style={{ display: 'grid', gap: 6, flex: 1 }}>
                <Skeleton w="38%" h={11} />
                <Skeleton w="76%" h={10} />
              </span>
            </li>
          ))}
        </ul>
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : data.length === 0 ? (
        <EmptyState art="bell" title={filter === 'unread' ? 'You’re all caught up' : 'No notifications'} compact={variant === 'staff'}>
          {filter === 'unread' ? 'Every notification has been read.' : 'Stock-outs, waiting-list updates and review results will appear here.'}
        </EmptyState>
      ) : variant === 'admin' ? (
        <div className="feed-days">
          {byDay(data).map((group) => (
            <section key={group.label} className="feed-day" aria-label={group.label}>
              <h2 className="feed-day__label">{group.label}</h2>
              <ul className="feed-day__list">
                {group.items.map((n) => (
                  <AdminCard
                    key={n.id}
                    n={n}
                    onOpen={() => {
                      markNotificationRead(user, n.id)
                      navigate(linkFor(n, user.role))
                    }}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <>
          {unread > 0 && filter !== 'unread' && <p className="feed__count">{unread} unread</p>}
          <ul className="feed__list">
            {data.map((n) => {
              const meta = NOTIF_META[n.type] || NOTIF_META.new_submission
              const Icon = meta.icon
              return (
                <li key={n.id}>
                  <button
                    className={cn('feed__item', !n.read && 'is-unread')}
                    onClick={() => {
                      markNotificationRead(user, n.id)
                      navigate(linkFor(n, user.role))
                    }}
                  >
                    <span className={cn('feed__icon', `feed__icon--${meta.tone}`)}>
                      <Icon size={17} aria-hidden />
                    </span>
                    <span className="feed__text">
                      <span className="feed__meta">
                        <span className="feed__type">{meta.label}</span>
                        {n.push && <span className="feed__push">Push</span>}
                        <time dateTime={new Date(n.at).toISOString()} title={formatDateTime(n.at)}>
                          {timeAgo(n.at)}
                        </time>
                      </span>
                      <span className="feed__body">{n.body}</span>
                    </span>
                    {!n.read && <span className="feed__dot" aria-label="Unread" />}
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
