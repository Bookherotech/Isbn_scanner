import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BellRing, CheckCheck, CheckCircle2, Flag, Hourglass, Inbox, PackageCheck, PackageX, RefreshCcw, TriangleAlert, XCircle } from 'lucide-react'
import { getNotifications, markAllNotificationsRead, markNotificationRead } from '../../services/mockApi'
import { useQuery, useTicker } from '../../hooks/useStore'
import { Segmented } from '../ui/Form'
import { Button } from '../ui/Button'
import { EmptyState, ErrorState, Skeleton } from '../ui/Feedback'
import { cn, formatDateTime, timeAgo } from '../../utils/format'

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

export function NotificationFeed({ user, variant = 'admin' }) {
  const [filter, setFilter] = useState('all')
  const { data, loading, error, reload } = useQuery(() => getNotifications(user, { filter }), [user.id, filter])
  const navigate = useNavigate()
  const [marking, setMarking] = useState(false)
  useTicker()

  const unread = data?.filter((n) => !n.read).length ?? 0
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
      <div className="feed__bar">
        <Segmented options={options} value={filter} onChange={setFilter} label="Filter notifications" />
        <Button
          variant="ghost"
          size="sm"
          icon={CheckCheck}
          loading={marking}
          onClick={async () => {
            setMarking(true)
            await markAllNotificationsRead(user)
            setMarking(false)
          }}
        >
          Mark all read
        </Button>
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
