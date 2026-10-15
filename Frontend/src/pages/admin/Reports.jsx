import { useState } from 'react'
import { BookCopy, CheckCircle2, Download, Hourglass, PackageX, Users, Warehouse, XCircle } from 'lucide-react'
import { getReports } from '../../services/mockApi'
import { useQuery } from '../../hooks/useStore'
import { Avatar, PageHeader, Panel } from '../../components/ui/Misc'
import { Select } from '../../components/ui/Form'
import { Button } from '../../components/ui/Button'
import { ErrorState, Skeleton } from '../../components/ui/Feedback'
import { LineChart, ShelfBars } from '../../components/charts/Charts'
import { ShelfFilter, StaffFilter } from '../../components/inventory/Filters'
import { downloadCsv, formatDate, formatDateTime } from '../../utils/format'

export default function Reports() {
  const [days, setDays] = useState(14)
  const [shelf, setShelf] = useState('')
  const [staff, setStaff] = useState('')
  const [status, setStatus] = useState('')
  const { data, error, reload, refreshing } = useQuery(() => getReports({ days, shelf, staff, status }), [days, shelf, staff, status])

  const exportSeries = () =>
    downloadCsv(
      `bookhero-books-${days}d.csv`,
      (data?.series ?? []).map((d) => ({ Date: formatDate(d.date, { year: 'numeric' }), Added: d.added, Approved: d.approved, Rejected: d.rejected })),
    )
  const exportStaff = () =>
    downloadCsv('bookhero-staff-activity.csv', (data?.staffRows ?? []).map((s) => ({ Staff: s.name, Submitted: s.submitted, Approved: s.approved, Rejected: s.rejected, Waiting: s.waiting, 'Approval rate %': s.rate ?? '' })))

  return (
    <div className={refreshing ? 'is-refreshing' : ''}>
      <PageHeader
        title="Reports"
        description="Throughput, review outcomes and where the stock is."
        actions={
          <Button icon={Download} onClick={exportSeries} disabled={!data}>
            Export CSV
          </Button>
        }
      />
      <div className="toolbar report-filters">
        <Select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Date range">
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
        </Select>
        <ShelfFilter value={shelf} onChange={setShelf} />
        <StaffFilter value={staff} onChange={setStaff} />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Any status</option>
          <option value="pending">Pending</option>
          <option value="waiting">Waiting list</option>
          <option value="live">Live</option>
          <option value="out_of_stock">Out of stock</option>
          <option value="rejected">Rejected</option>
        </Select>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <div className="reports">
          <section className="report-totals" aria-label="Totals">
            {[
              ['Books added', data?.totals.added],
              ['Approved', data?.totals.approved],
              ['Rejected', data?.totals.rejected, data && `${data.totals.autoRejected} by duplicate check`],
              ['Waiting list', data?.totals.waiting, 'open entries'],
              ['Out of stock', data?.totals.outOfStock, 'right now'],
            ].map(([l, v, sub]) => (
              <div key={l} className="report-total">
                <span className="kpis__label">{l}</span>
                {!data ? <Skeleton w={50} h={26} /> : <span className="kpis__value num">{v}</span>}
                <span className="kpis__sub">{sub || `last ${days} days`}</span>
              </div>
            ))}
          </section>

          <ReportLibrary data={data} days={days} />

          <Panel title="Books added, approved and rejected" eyebrow={`Last ${days} days`} className="reports__trend">
            {!data ? (
              <Skeleton h={230} r={6} />
            ) : (
              <LineChart
                data={data.series}
                series={[
                  { key: 'added', label: 'Added', color: 'var(--ink)', width: 2.4 },
                  { key: 'approved', label: 'Approved', color: '#1d744a' },
                  { key: 'rejected', label: 'Rejected', color: '#b4232a', dash: '4 4' },
                ]}
              />
            )}
          </Panel>

          <Panel title="Inventory by shelf" eyebrow="Units on Shopify" className="reports__shelves">
            {!data ? <Skeleton h={230} r={6} /> : <ShelfBars shelves={data.byShelf.filter((s) => s.units > 0)} limit={10} />}
          </Panel>

          <Panel
            title="Staff activity"
            className="reports__staff"
            action={
              <Button size="sm" variant="ghost" icon={Download} onClick={exportStaff} disabled={!data}>
                CSV
              </Button>
            }
          >
            {!data ? (
              <Skeleton h={200} r={6} />
            ) : (
              <div className="table-wrap table-wrap--plain">
                <table className="table table--dense">
                  <thead>
                    <tr>
                      <th>Staff</th>
                      <th style={{ textAlign: 'right' }}>Submitted</th>
                      <th style={{ textAlign: 'right' }}>Approved</th>
                      <th style={{ textAlign: 'right' }}>Rejected</th>
                      <th style={{ textAlign: 'right' }}>Waiting</th>
                      <th style={{ textAlign: 'right' }}>Approval rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.staffRows.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <span className="person">
                            <Avatar name={s.name} hue={s.hue} size={22} />
                            {s.name}
                            {s.status === 'inactive' && <span className="muted"> (inactive)</span>}
                          </span>
                        </td>
                        <td className="num" style={{ textAlign: 'right' }}>
                          <strong>{s.submitted}</strong>
                        </td>
                        <td className="num" style={{ textAlign: 'right' }}>
                          {s.approved}
                        </td>
                        <td className="num" style={{ textAlign: 'right' }}>
                          {s.rejected}
                        </td>
                        <td className="num" style={{ textAlign: 'right' }}>
                          {s.waiting}
                        </td>
                        <td className="num" style={{ textAlign: 'right' }}>
                          {s.rate == null ? '—' : `${s.rate}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Rejection reasons" className="reports__reasons">
            {!data ? (
              <Skeleton h={160} r={6} />
            ) : data.reasons.length === 0 ? (
              <p className="muted">No rejections in this range.</p>
            ) : (
              <ul className="reasons-list">
                {data.reasons.map((r) => (
                  <li key={r.reason}>
                    <span>{r.reason}</span>
                    <span className="reasons-list__bar" aria-hidden>
                      <span style={{ width: `${(r.count / data.reasons[0].count) * 100}%` }} />
                    </span>
                    <span className="num">{r.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}
    </div>
  )
}


/* ---------- Report library: ready-made mock reports with CSV export ---------- */
function ReportLibrary({ data, days }) {
  const d = (t) => (t ? formatDateTime(t) : '')
  const reports = data
    ? [
        {
          key: 'added', icon: BookCopy, name: 'Books added', desc: `Every book submitted by staff in the last ${days} days, with current status.`,
          rows: data.lists.added.map((r) => ({ Title: r.title, Author: r.author, ISBN: r.isbn, Shelf: r.shelf, Quantity: r.quantity, 'Submitted by': r.submittedBy, Submitted: d(r.submittedAt), Status: r.status })),
        },
        {
          key: 'approved', icon: CheckCircle2, name: 'Books approved', desc: 'Approvals with the Shopify product created for each book.',
          rows: data.lists.approved.map((r) => ({ Title: r.title, Author: r.author, ISBN: r.isbn, Shelf: r.shelf, Quantity: r.quantity, Approved: d(r.approvedAt), 'Shopify product': r.productId })),
        },
        {
          key: 'rejected', icon: XCircle, name: 'Books rejected', desc: 'Duplicate-check and admin rejections with reasons.',
          rows: data.lists.rejected.map((r) => ({ Title: r.title, Author: r.author, ISBN: r.isbn, Shelf: r.shelf, Reason: r.reason, 'Rejected by': r.by, Rejected: d(r.rejectedAt), 'Submitted by': r.submittedBy })),
        },
        {
          key: 'waiting', icon: Hourglass, name: 'Waiting list', desc: 'Open waiting-list entries and the stock they are waiting behind.',
          rows: data.lists.waiting.map((r) => ({ Title: r.title, Author: r.author, 'Current shelf': r.currentShelf, 'Current stock': r.currentStock, 'Waiting shelf': r.shelf, Quantity: r.quantity, Status: r.ready ? 'Ready for approval' : 'Waiting', 'Submitted by': r.submittedBy })),
        },
        {
          key: 'oos', icon: PackageX, name: 'Out of stock', desc: 'Sold-out books, when stock-out was detected and push reminder status.',
          rows: data.lists.outOfStock.map((r) => ({ Title: r.title, Author: r.author, Shelf: r.shelf, 'Stock-out detected': d(r.stockOutAt), 'Push #2 sent': r.push2 ? 'Yes' : 'No', 'Waiting entries': r.waitingEntries })),
        },
        {
          key: 'shelf', icon: Warehouse, name: 'Inventory by shelf', desc: 'Books, units on Shopify and waiting entries per shelf.',
          rows: data.byShelf.map((s) => ({ Shelf: s.code, Status: s.status, Books: s.titles, Units: s.units, Waiting: s.waiting, Pending: s.pending })),
        },
        {
          key: 'staff', icon: Users, name: 'Staff activity', desc: 'Submissions, approvals, rejections and approval rate per staff member.',
          rows: data.staffRows.map((s) => ({ Staff: s.name, Submitted: s.submitted, Approved: s.approved, Rejected: s.rejected, Waiting: s.waiting, 'Approval rate %': s.rate ?? '' })),
        },
      ]
    : []
  return (
    <Panel title="Report library" eyebrow="Mock data · CSV export" className="reports__library">
      {!data ? (
        <Skeleton h={160} r={6} />
      ) : (
        <ul className="replib">
          {reports.map((r) => (
            <li key={r.key} className="replib__item">
              <span className="replib__icon">
                <r.icon size={17} aria-hidden />
              </span>
              <span className="replib__text">
                <strong>{r.name}</strong>
                <span>{r.desc}</span>
              </span>
              <span className="replib__count num">{r.rows.length} rows</span>
              <Button size="sm" icon={Download} disabled={!r.rows.length} onClick={() => downloadCsv(`bookhero-${r.key}-report.csv`, r.rows)}>
                CSV
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
