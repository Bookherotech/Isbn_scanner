import { useState } from 'react'
import { BookCopy, CheckCircle2, Download, Hourglass, PackageX, Users, Warehouse, XCircle } from 'lucide-react'
import { getFilterOptions, getReports } from '../../services/adminApi'
import { useQuery } from '../../hooks/useStore'
import { Avatar, PageHeader, Panel } from '../../components/ui/Misc'
import { Select } from '../../components/ui/Form'
import { Button } from '../../components/ui/Button'
import { ErrorState, Skeleton } from '../../components/ui/Feedback'
import { LineChart, ShelfBars } from '../../components/charts/Charts'
import { ShelfFilter, StaffFilter } from '../../components/inventory/Filters'
import { formatDate, formatDateTime } from '../../utils/format'
import { downloadXlsx } from '../../utils/xlsx'

const STATUS_LABEL = { pending: 'Pending', waiting: 'Waiting list', live: 'Live', out_of_stock: 'Out of stock', rejected: 'Rejected' }

export default function Reports() {
  const [days, setDays] = useState(14)
  const [shelf, setShelf] = useState('')
  const [staff, setStaff] = useState('')
  const [status, setStatus] = useState('')
  const { data, error, reload, refreshing } = useQuery(() => getReports({ days, shelf, staff, status }), [days, shelf, staff, status])

  // Every export is a styled Excel file: real dates (a CSV date showed as ##### in Excel), header, stripes, totals and
  // a line with the period and filters used.
  const filterLine = async (period) => {
    const options = await getFilterOptions().catch(() => null)
    const staffName = staff ? options?.staff.find((s) => String(s.id) === String(staff))?.name || 'One staff member' : 'All staff'
    return [period, shelf ? `Shelf ${shelf}` : 'All shelves', staffName, STATUS_LABEL[status] || 'Any status', `Exported ${formatDateTime(Date.now())}`].join('  ·  ')
  }
  const exportSeries = async () => {
    const series = data?.series ?? []
    const range = series.length ? ` (${formatDate(series[0].date, { year: 'numeric' })} – ${formatDate(series[series.length - 1].date, { year: 'numeric' })})` : ''
    downloadXlsx(`bookhero-books-${days}d.xlsx`, {
      sheet: `Books, last ${days} days`,
      title: 'BookHero · Books added, approved and rejected',
      subtitle: await filterLine(`Last ${days} days${range}`),
      columns: [
        { header: 'Date', key: 'date', type: 'date', width: 22 },
        { header: 'Added', key: 'added', type: 'number', width: 14 },
        { header: 'Approved', key: 'approved', type: 'number', width: 14 },
        { header: 'Rejected', key: 'rejected', type: 'number', width: 14 },
      ],
      rows: series,
      totals: true,
    })
  }
  const exportReport = async (report) =>
    downloadXlsx(`bookhero-${report.key}-report.xlsx`, {
      sheet: report.name,
      title: `BookHero · ${report.name}`,
      subtitle: await filterLine(report.current ? 'Right now' : `Last ${days} days`),
      columns: report.columns,
      rows: report.rows,
      totals: true,
    })
  const exportStaff = () => exportReport(libraryReports(data, days).find((r) => r.key === 'staff'))

  return (
    <div className={refreshing ? 'is-refreshing' : ''}>
      <PageHeader
        title="Reports"
        description="Throughput, review outcomes and where the stock is."
        actions={
          <Button icon={Download} onClick={exportSeries} disabled={!data}>
            Export Excel
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

          <ReportLibrary data={data} days={days} onExport={exportReport} />

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
                Excel
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



/* ---------- Report library: ready-made reports, each exported as a styled Excel file ---------- */
const text = (header, key) => ({ header, key })
const number = (header, key, extra = {}) => ({ header, key, type: 'number', ...extra })
const when = (header, key) => ({ header, key, type: 'datetime' })

/** The library's reports: columns (with Excel types) and the raw rows. `current`: a "right now" list, not the period. */
function libraryReports(data, days) {
  if (!data) return []
  return [
    {
      key: 'added', icon: BookCopy, name: 'Books added', desc: `Every book submitted by staff in the last ${days} days, with current status.`,
      columns: [text('Title', 'title'), text('Author', 'author'), text('ISBN', 'isbn'), text('Shelf', 'shelf'), number('Quantity', 'quantity'), text('Submitted by', 'submittedBy'), when('Submitted', 'submittedAt'), text('Status', 'status')],
      rows: data.lists.added,
    },
    {
      key: 'approved', icon: CheckCircle2, name: 'Books approved', desc: 'Approvals with the Shopify product for each book.',
      columns: [text('Title', 'title'), text('Author', 'author'), text('ISBN', 'isbn'), text('Shelf', 'shelf'), number('Quantity', 'quantity'), when('Approved', 'approvedAt'), text('Shopify product', 'productId')],
      rows: data.lists.approved,
    },
    {
      key: 'rejected', icon: XCircle, name: 'Books rejected', desc: 'Duplicate-check and admin rejections with reasons.',
      columns: [text('Title', 'title'), text('Author', 'author'), text('ISBN', 'isbn'), text('Shelf', 'shelf'), text('Reason', 'reason'), text('Rejected by', 'by'), when('Rejected', 'rejectedAt'), text('Submitted by', 'submittedBy')],
      rows: data.lists.rejected,
    },
    {
      key: 'waiting', icon: Hourglass, name: 'Waiting list', desc: 'Open waiting-list entries and the stock they are waiting behind.', current: true,
      columns: [text('Title', 'title'), text('Author', 'author'), text('Current shelf', 'currentShelf'), number('Current stock', 'currentStock'), text('Waiting shelf', 'shelf'), number('Quantity', 'quantity'), text('Status', 'state'), text('Submitted by', 'submittedBy')],
      rows: data.lists.waiting.map((r) => ({ ...r, state: r.ready ? 'Ready for approval' : 'Waiting' })),
    },
    {
      key: 'oos', icon: PackageX, name: 'Out of stock', desc: 'Sold-out books and when the stock-out was detected.', current: true,
      columns: [text('Title', 'title'), text('Author', 'author'), text('Shelf', 'shelf'), when('Stock-out detected', 'stockOutAt'), number('Waiting entries', 'waitingEntries')],
      rows: data.lists.outOfStock,
    },
    {
      key: 'shelf', icon: Warehouse, name: 'Inventory by shelf', desc: 'Books, units on Shopify and waiting entries per shelf.', current: true,
      columns: [text('Shelf', 'code'), text('Status', 'status'), number('Books', 'titles'), number('Units', 'units'), number('Waiting', 'waiting'), number('Pending', 'pending')],
      rows: data.byShelf,
    },
    {
      key: 'staff', icon: Users, name: 'Staff activity', desc: 'Submissions, approvals, rejections and approval rate per staff member.',
      columns: [text('Staff', 'name'), number('Submitted', 'submitted'), number('Approved', 'approved'), number('Rejected', 'rejected'), number('Waiting', 'waiting'), number('Approval rate %', 'rate', { total: false })],
      rows: data.staffRows,
    },
  ]
}

function ReportLibrary({ data, days, onExport }) {
  const reports = libraryReports(data, days)
  return (
    <Panel title="Report library" eyebrow="Excel export" className="reports__library">
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
              <Button size="sm" icon={Download} disabled={!r.rows.length} onClick={() => onExport(r)}>
                Excel
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
