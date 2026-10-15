import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useQuery, useTicker } from '../../hooks/useStore'
import { getMySubmissions } from '../../services/mockApi'
import { SubmissionCard } from '../../components/staff/StaffBits'
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback'
import { Button } from '../../components/ui/Button'
import { cn } from '../../utils/format'

const FILTERS = [
  ['all', 'All'],
  ['pending', 'Pending'],
  ['waiting', 'Waiting'],
  ['live', 'Live'],
  ['out_of_stock', 'Out of stock'],
  ['rejected', 'Rejected'],
]

export default function Submissions() {
  const { user } = useAuth()
  const [status, setStatus] = useState('all')
  const [pageSize, setPageSize] = useState(12)
  const { data, loading, error, reload } = useQuery(() => getMySubmissions(user.id, { status, pageSize }), [user.id, status, pageSize])
  useTicker()

  return (
    <div className="s-page">
      <header className="s-pagehead">
        <h1>My submissions</h1>
        <p className="muted">{data ? `${data.counts.all} books submitted` : 'Loading…'}</p>
      </header>
      <div className="s-filters" role="tablist" aria-label="Filter by status">
        {FILTERS.map(([k, l]) => (
          <button
            key={k}
            role="tab"
            aria-selected={status === k}
            className={cn('s-filter', status === k && 'is-active')}
            onClick={() => {
              setStatus(k)
              setPageSize(12)
            }}
          >
            {l}
            {data?.counts[k] ? <span className="num">{data.counts[k]}</span> : null}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="s-list">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} h={78} r={10} />
          ))}
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={reload} compact />
      ) : data.rows.length === 0 ? (
        <EmptyState art="books" title={status === 'all' ? 'No submissions yet' : 'Nothing here'} compact>
          {status === 'all' ? 'Books you scan and submit appear here with their review status.' : 'No submissions with this status.'}
        </EmptyState>
      ) : (
        <>
          <div className="s-list">
            {data.rows.map((it) => (
              <SubmissionCard key={it.id} item={it} />
            ))}
          </div>
          {data.total > data.rows.length && (
            <Button block variant="secondary" onClick={() => setPageSize((n) => n + 12)} className="s-more">
              Show more ({data.total - data.rows.length})
            </Button>
          )}
        </>
      )}
    </div>
  )
}
