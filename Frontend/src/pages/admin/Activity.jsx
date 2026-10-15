import { useState } from 'react'
import { Download } from 'lucide-react'
import { getActivity, selectors } from '../../services/mockApi'
import { useDebounce, useQuery, useTicker } from '../../hooks/useStore'
import { Pagination } from '../../components/ui/Data'
import { PageHeader } from '../../components/ui/Misc'
import { SearchInput, Select } from '../../components/ui/Form'
import { Button } from '../../components/ui/Button'
import { EmptyState, ErrorState, TableSkeleton } from '../../components/ui/Feedback'
import { ActorAvatar } from '../../components/dashboard/ActivityRow'
import { cn, downloadCsv, formatDateTime, formatTime, longDate } from '../../utils/format'

const TYPES = [
  ['submission', 'Submissions'],
  ['approval', 'Approvals'],
  ['rejection', 'Rejections'],
  ['waiting', 'Waiting list'],
  ['stock', 'Stock'],
  ['notification', 'Notifications'],
  ['shopify', 'Shopify'],
  ['flag', 'Content flags'],
  ['edit', 'Edits'],
  ['shelf', 'Shelves'],
  ['staff', 'Staff'],
]
const RESULT = { success: 'Success', error: 'Rejected', warning: 'Attention', info: 'Info' }

export default function ActivityLog() {
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [actor, setActor] = useState('')
  const [page, setPage] = useState(1)
  const dq = useDebounce(q)
  const { data, loading, error, reload, refreshing } = useQuery(() => getActivity({ q: dq, type, actor, page, pageSize: 30 }), [dq, type, actor, page])
  useTicker()
  const people = selectors.staffOptions()
  const r1 = (fn) => (v) => {
    fn(v?.target ? v.target.value : v)
    setPage(1)
  }

  const groups = []
  for (const a of data?.rows ?? []) {
    const day = new Date(a.at).toDateString()
    if (!groups.length || groups[groups.length - 1].day !== day) groups.push({ day, at: a.at, rows: [] })
    groups[groups.length - 1].rows.push(a)
  }

  return (
    <div>
      <PageHeader
        title="Activity log"
        description="Every submission, decision, stock event and Shopify sync — who did what, and when."
        actions={
          <Button
            icon={Download}
            onClick={async () => {
              const all = await getActivity({ q: dq, type, actor, page: 1, pageSize: 5000 })
              downloadCsv('bookhero-activity.csv', all.rows.map((a) => ({ Time: formatDateTime(a.at), User: a.actorName, Action: a.action, Object: a.object, Detail: a.detail, Result: RESULT[a.result] })))
            }}
          >
            Export CSV
          </Button>
        }
      />
      <div className="toolbar">
        <SearchInput value={q} onChange={r1(setQ)} placeholder="Search action, book or person" />
        <Select value={type} onChange={r1(setType)} aria-label="Event type">
          <option value="">All events</option>
          {TYPES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
        <Select value={actor} onChange={r1(setActor)} aria-label="User">
          <option value="">Everyone</option>
          <option value="u_admin">Admin (Rachel)</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value="system">System</option>
          <option value="shopify">Shopify</option>
        </Select>
      </div>
      {loading ? (
        <TableSkeleton rows={10} cols={5} />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data.rows.length ? (
        <EmptyState art="activity" title="No activity yet">
          {dq || type || actor ? 'No events match these filters.' : 'Actions in BookHero will be recorded here.'}
        </EmptyState>
      ) : (
        <div className={cn('log', refreshing && 'is-refreshing')}>
          <div className="log__head" aria-hidden>
            <span>Time</span>
            <span>User</span>
            <span>Action · object</span>
            <span>Result</span>
          </div>
          {groups.map((g) => (
            <section key={g.day} className="log__day">
              <h2 className="log__date">{longDate(g.at)}</h2>
              <ul>
                {g.rows.map((a) => (
                  <li key={a.id} className="log__row">
                    <time className="log__time num" dateTime={new Date(a.at).toISOString()}>
                      {formatTime(a.at)}
                    </time>
                    <span className="log__actor">
                      <ActorAvatar actor={a.actor} name={a.actorName} size={24} />
                      <span>{a.actorName}</span>
                    </span>
                    <span className="log__what">
                      <span>
                        <strong>{a.action}</strong> <span className="log__obj">{a.object}</span>
                      </span>
                      {a.detail && <span className="log__detail">{a.detail}</span>}
                    </span>
                    <span className={cn('log__result', `is-${a.result}`)}>{RESULT[a.result]}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {data && <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.pageSize} onPage={setPage} noun="events" />}
    </div>
  )
}
