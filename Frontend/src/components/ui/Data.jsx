import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn, fmtNum } from '../../utils/format'
import { useMediaQuery } from '../../hooks/useStore'
import { ErrorState, TableSkeleton } from './Feedback'

/**
 * Responsive data table. Desktop: dense table. ≤ 860px: stacked cards using
 * the same column config (card: 'title' | 'badge' | 'meta' | 'hide').
 */
export function DataTable({ columns, rows, rowKey = 'id', loading, error, onRetry, empty, onRowClick, refreshing, dense, caption }) {
  const mobile = useMediaQuery('(max-width: 860px)')
  if (loading) return <TableSkeleton cols={Math.min(columns.length, 7)} />
  if (error) return <ErrorState error={error} onRetry={onRetry} />
  if (!rows?.length) return empty || null

  if (mobile) {
    const title = columns.find((c) => c.card === 'title') || columns[0]
    const badge = columns.find((c) => c.card === 'badge')
    const action = columns.find((c) => c.card === 'action')
    const meta = columns.filter((c) => c.card === 'meta')
    return (
      <ul className={cn('cardlist', refreshing && 'is-refreshing')}>
        {rows.map((row) => (
          <li key={row[rowKey]}>
            <div
              className={cn('rowcard', onRowClick && 'is-clickable')}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(row) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              role={onRowClick ? 'button' : undefined}
            >
              <div className="rowcard__top">
                <div className="rowcard__title">{title.render(row)}</div>
                {badge && <div className="rowcard__badge">{badge.render(row)}</div>}
              </div>
              {meta.length > 0 && (
                <dl className="rowcard__meta">
                  {meta.map((c) => (
                    <div key={c.key}>
                      <dt>{c.header}</dt>
                      <dd>{c.render(row)}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {action && <div className="rowcard__action" onClick={(e) => e.stopPropagation()}>{action.render(row)}</div>}
            </div>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className={cn('table-wrap', refreshing && 'is-refreshing')}>
      <table className={cn('table', dense && 'table--dense')}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={{ width: c.width, textAlign: c.align }} scope="col">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row[rowKey]}
              className={cn(onRowClick && 'is-clickable', row.__highlight && 'is-highlight')}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={onRowClick ? (e) => e.key === 'Enter' && e.target === e.currentTarget && onRowClick(row) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
            >
              {columns.map((c) => (
                <td key={c.key} style={{ textAlign: c.align }} className={c.className} onClick={c.card === 'action' ? (e) => e.stopPropagation() : undefined}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Pagination({ page, pages, total, pageSize, onPage, noun = 'books' }) {
  if (!total) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  const nums = []
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 1) nums.push(p)
    else if (nums[nums.length - 1] !== '…') nums.push('…')
  }
  return (
    <nav className="pager" aria-label="Pagination">
      <span className="pager__info num">
        {fmtNum(from)}–{fmtNum(to)} of {fmtNum(total)} {noun}
      </span>
      {pages > 1 && (
        <div className="pager__ctrls">
          <button className="pager__btn" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
            <ChevronLeft size={16} />
          </button>
          {nums.map((n, i) =>
            n === '…' ? (
              <span key={`e${i}`} className="pager__gap">
                …
              </span>
            ) : (
              <button key={n} className={cn('pager__btn num', n === page && 'is-current')} aria-current={n === page ? 'page' : undefined} onClick={() => onPage(n)}>
                {n}
              </button>
            ),
          )}
          <button className="pager__btn" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Next page">
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </nav>
  )
}
