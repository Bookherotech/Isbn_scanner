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
import { countBy, downloadXlsx } from '../../utils/xlsx'

const STATUS_LABEL = { pending: 'Pending', waiting: 'Waiting list', live: 'Live', out_of_stock: 'Out of stock', rejected: 'Rejected', closed: 'Closed' }
// Colours of statuses in the Excel exports (tags in the list, slices in the charts)
const STATUS_TONES = { Pending: 'violet', 'Waiting list': 'brand', Live: 'green', 'Out of stock': 'orange', Rejected: 'red', Closed: 'grey', 'Ready for approval': 'green', Waiting: 'brand', Active: 'green', Inactive: 'grey' }

const pct = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : '–')
const total = (rows, key) => rows.reduce((s, r) => s + (Number(r[key]) || 0), 0)
const distinct = (rows, key) => new Set(rows.map((r) => r[key]).filter(Boolean)).size
const toned = (items) => items.map((it) => ({ ...it, tone: STATUS_TONES[it.label] || 'grey' }))
const plural = (n, one, many = `${one}s`) => `${n.toLocaleString('en')} ${n === 1 ? one : many}`

export default function Reports() {
  const [days, setDays] = useState(14)
  const [shelf, setShelf] = useState('')
  const [staff, setStaff] = useState('')
  const [status, setStatus] = useState('')
  const { data, error, reload, refreshing } = useQuery(() => getReports({ days, shelf, staff, status }), [days, shelf, staff, status])

  // Every export is a styled Excel workbook (utils/xlsx.js): an Overview dashboard (KPI cards, a chart, highlights)
  // and the full list, with a line of the period and filters used.
  const filterLine = async (period) => {
    const options = await getFilterOptions().catch(() => null)
    const staffName = staff ? options?.staff.find((s) => String(s.id) === String(staff))?.name || 'One staff member' : 'All staff'
    return [period, shelf ? `Shelf ${shelf}` : 'All shelves', staffName, STATUS_LABEL[status] || 'Any status'].join('   ·   ')
  }
  const exportedLine = () => `Exported ${formatDateTime(Date.now())}`
  const exportSeries = async () => {
    const series = data?.series ?? []
    const from = series.length ? formatDate(series[0].date, { year: 'numeric' }) : ''
    const to = series.length ? formatDate(series[series.length - 1].date, { year: 'numeric' }) : ''
    const added = total(series, 'added')
    const approved = total(series, 'approved')
    const rejected = total(series, 'rejected')
    const reviewed = approved + rejected
    const busiest = series.reduce((m, d) => (d.added > (m?.added ?? 0) ? d : m), null)
    const quiet = series.filter((d) => !d.added && !d.approved && !d.rejected).length
    downloadXlsx(`bookhero-books-${days}d.xlsx`, {
      sheet: `Books, last ${days} days`,
      title: 'Books added, approved and rejected',
      subtitle: await filterLine(`Last ${days} days${series.length ? ` (${from} – ${to})` : ''}`),
      meta: exportedLine(),
      columns: [
        { header: 'Date', key: 'date', type: 'date', width: 22 },
        { header: 'Added', key: 'added', type: 'number', width: 17 },
        { header: 'Approved', key: 'approved', type: 'number', width: 17 },
        { header: 'Rejected', key: 'rejected', type: 'number', width: 17 },
      ],
      rows: series,
      totals: true,
      countLabel: 'Days',
      bars: true,
      tiles: [
        { label: 'Days', value: series.length, note: series.length ? `${formatDate(series[0].date)} – ${formatDate(series[series.length - 1].date)}` : '', tone: 'ink' },
        { label: 'Added', value: added, note: `${(added / (series.length || 1)).toFixed(1)} a day on average`, tone: 'brand', spark: series.map((d) => d.added) },
        { label: 'Approved', value: approved, note: reviewed ? `${pct(approved, reviewed)} of reviewed books` : 'Nothing reviewed', tone: 'green', spark: series.map((d) => d.approved) },
        { label: 'Rejected', value: rejected, note: reviewed ? `${pct(rejected, reviewed)} of reviewed books` : 'Nothing reviewed', tone: 'red', spark: series.map((d) => d.rejected) },
      ],
      chart: {
        type: 'column',
        title: 'Day by day',
        categories: series.map((d) => formatDate(d.date)),
        series: [
          { name: 'Added', values: series.map((d) => d.added), tone: 'brand' },
          { name: 'Approved', values: series.map((d) => d.approved), tone: 'green' },
          { name: 'Rejected', values: series.map((d) => d.rejected), tone: 'red' },
        ],
      },
      highlights: [
        busiest && { label: 'Busiest day', value: `${formatDate(busiest.date, { weekday: 'short' })} — ${plural(busiest.added, 'book')} added` },
        reviewed && { label: 'Approval rate', value: `${pct(approved, reviewed)} of the ${plural(reviewed, 'reviewed book')} were approved` },
        series.length && { label: 'Quiet days', value: `${quiet} of ${series.length} days had no activity` },
      ].filter(Boolean),
    })
  }
  const exportReport = async (report) =>
    downloadXlsx(`bookhero-${report.key}-report.xlsx`, {
      sheet: report.name,
      title: report.name,
      subtitle: await filterLine(report.current ? 'Right now' : `Last ${days} days`),
      meta: exportedLine(),
      columns: report.columns,
      rows: report.rows,
      totals: true,
      countLabel: report.count,
      bars: report.bars,
      ...report.summary(report.rows),
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
              <div className="table-wrap table-wrap--plain table-wrap--stack">
                <table className="table table--dense table--stack">
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
                        <td className="num" style={{ textAlign: 'right' }} data-label="Submitted">
                          <strong>{s.submitted}</strong>
                        </td>
                        <td className="num" style={{ textAlign: 'right' }} data-label="Approved">
                          {s.approved}
                        </td>
                        <td className="num" style={{ textAlign: 'right' }} data-label="Rejected">
                          {s.rejected}
                        </td>
                        <td className="num" style={{ textAlign: 'right' }} data-label="Waiting">
                          {s.waiting}
                        </td>
                        <td className="num" style={{ textAlign: 'right' }} data-label="Approval rate">
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



/* ---------- Report library: ready-made reports, each exported as a styled Excel workbook ---------- */
const text = (header, key) => ({ header, key })
const number = (header, key, extra = {}) => ({ header, key, type: 'number', ...extra })
const when = (header, key) => ({ header, key, type: 'datetime' })
const tag = (header, key) => ({ header, key, tones: STATUS_TONES })
const statusText = (s) => STATUS_LABEL[s] || (s ? s.charAt(0).toUpperCase() + s.slice(1) : '')

/** Top shelves by number of rows, as a bar chart. */
const shelfBars = (rows, title, tone) => {
  const top = countBy(rows, 'shelf').slice(0, 8)
  return { type: 'bar', title, categories: top.map((s) => s.label), series: [{ name: 'Books', values: top.map((s) => s.value), tone }] }
}

/**
 * The library's reports: columns (with Excel types), the rows, and `summary(rows)`: the Overview sheet of the export
 * (KPI cards, chart, breakdown, highlights). `current`: a "right now" list, not the period.
 */
function libraryReports(data, days) {
  if (!data) return []
  return [
    {
      key: 'added', count: 'Books', icon: BookCopy, name: 'Books added', desc: `Every book submitted by staff in the last ${days} days, with current status.`,
      columns: [text('Title', 'title'), text('Author', 'author'), text('ISBN', 'isbn'), text('Shelf', 'shelf'), number('Quantity', 'quantity'), text('Submitted by', 'submittedBy'), when('Submitted', 'submittedAt'), tag('Status', 'statusText')],
      rows: data.lists.added.map((r) => ({ ...r, statusText: statusText(r.status) })),
      summary: (rows) => {
        const byStatus = countBy(rows, 'statusText')
        const count = (label) => byStatus.find((s) => s.label === label)?.value || 0
        const topStaff = countBy(rows, 'submittedBy')[0]
        const topShelf = countBy(rows, 'shelf')[0]
        return {
          tiles: [
            { label: 'Books', value: rows.length, note: `from ${plural(distinct(rows, 'submittedBy'), 'staff member')}`, tone: 'ink' },
            { label: 'Copies', value: total(rows, 'quantity'), note: 'units scanned in', tone: 'brand' },
            { label: 'Live', value: count('Live'), note: `${pct(count('Live'), rows.length)} of these books`, tone: 'green' },
            { label: 'Pending', value: count('Pending'), note: 'waiting for review', tone: 'violet' },
          ],
          chart: { type: 'doughnut', title: 'Where these books are now' },
          breakdown: { title: 'By status', total: plural(rows.length, 'book'), items: toned(byStatus) },
          highlights: [
            topStaff && { label: 'Most books added', value: `${topStaff.label} — ${plural(topStaff.value, 'book')}` },
            topShelf && { label: 'Busiest shelf', value: `${topShelf.label} — ${plural(topShelf.value, 'book')}` },
          ].filter(Boolean),
        }
      },
    },
    {
      key: 'approved', count: 'Books', icon: CheckCircle2, name: 'Books approved', desc: 'Approvals with the Shopify product for each book.',
      columns: [text('Title', 'title'), text('Author', 'author'), text('ISBN', 'isbn'), text('Shelf', 'shelf'), number('Quantity', 'quantity'), when('Approved', 'approvedAt'), text('Shopify product', 'productId')],
      rows: data.lists.approved,
      summary: (rows) => {
        const topDay = countBy(rows, (r) => r.approvedAt && formatDate(r.approvedAt, { weekday: 'short' })).find((d) => d.label !== 'Not set')
        return {
          tiles: [
            { label: 'Books', value: rows.length, note: 'approved and on Shopify', tone: 'green' },
            { label: 'Copies', value: total(rows, 'quantity'), note: 'units sent to Shopify', tone: 'brand' },
            { label: 'Shelves', value: distinct(rows, 'shelf'), note: 'shelves they sit on', tone: 'ink' },
          ],
          chart: shelfBars(rows, 'Approvals by shelf', 'green'),
          highlights: [topDay && { label: 'Most approvals', value: `${topDay.label} — ${plural(topDay.value, 'book')}` }].filter(Boolean),
        }
      },
    },
    {
      key: 'rejected', count: 'Books', icon: XCircle, name: 'Books rejected', desc: 'Duplicate-check and admin rejections with reasons.',
      columns: [text('Title', 'title'), text('Author', 'author'), text('ISBN', 'isbn'), text('Shelf', 'shelf'), text('Reason', 'reason'), text('Rejected by', 'by'), when('Rejected', 'rejectedAt'), text('Submitted by', 'submittedBy')],
      rows: data.lists.rejected,
      summary: (rows) => {
        const reasons = countBy(rows, 'reason')
        const bySystem = rows.filter((r) => r.by === 'System').length
        return {
          tiles: [
            { label: 'Books', value: rows.length, note: 'rejected in this period', tone: 'red' },
            { label: 'Duplicate check', value: bySystem, note: 'caught automatically', tone: 'orange' },
            { label: 'By admins', value: rows.length - bySystem, note: 'rejected on review', tone: 'violet' },
          ],
          chart: { type: 'doughnut', title: 'Why books were rejected' },
          breakdown: { title: 'By reason', total: plural(rows.length, 'book'), items: reasons.map((r, i) => ({ ...r, tone: ['red', 'orange', 'violet', 'brand', 'ink', 'grey'][i % 6] })) },
          highlights: [reasons[0] && { label: 'Top reason', value: `${reasons[0].label} — ${plural(reasons[0].value, 'book')} (${pct(reasons[0].value, rows.length)})` }].filter(Boolean),
        }
      },
    },
    {
      key: 'waiting', count: 'Entries', icon: Hourglass, name: 'Waiting list', desc: 'Open waiting-list entries and the stock they are waiting behind.', current: true,
      columns: [text('Title', 'title'), text('Author', 'author'), text('Current shelf', 'currentShelf'), number('Current stock', 'currentStock'), text('Waiting shelf', 'shelf'), number('Quantity', 'quantity'), tag('Status', 'state'), text('Submitted by', 'submittedBy')],
      rows: data.lists.waiting.map((r) => ({ ...r, state: r.ready ? 'Ready for approval' : 'Waiting' })),
      summary: (rows) => {
        const ready = rows.filter((r) => r.ready).length
        const topShelf = countBy(rows, 'shelf')[0]
        return {
          tiles: [
            { label: 'Entries', value: rows.length, note: 'open right now', tone: 'ink' },
            { label: 'Copies', value: total(rows, 'quantity'), note: 'units waiting', tone: 'brand' },
            { label: 'Ready', value: ready, note: 'stock sold out, approve now', tone: 'green' },
            { label: 'Still waiting', value: rows.length - ready, note: 'stock still on sale', tone: 'violet' },
          ],
          chart: { type: 'doughnut', title: 'Ready or still waiting' },
          breakdown: { title: 'By status', total: plural(rows.length, 'entry', 'entries'), items: toned(countBy(rows, 'state')) },
          highlights: [topShelf && { label: 'Most waiting', value: `Shelf ${topShelf.label} — ${plural(topShelf.value, 'entry', 'entries')}` }].filter(Boolean),
        }
      },
    },
    {
      key: 'oos', count: 'Books', icon: PackageX, name: 'Out of stock', desc: 'Sold-out books and when the stock-out was detected.', current: true,
      columns: [text('Title', 'title'), text('Author', 'author'), text('Shelf', 'shelf'), when('Stock-out detected', 'stockOutAt'), number('Waiting entries', 'waitingEntries')],
      rows: data.lists.outOfStock,
      summary: (rows) => ({
        tiles: [
          { label: 'Books', value: rows.length, note: 'sold out right now', tone: 'orange' },
          { label: 'Waiting entries', value: total(rows, 'waitingEntries'), note: 'copies ready to replace them', tone: 'brand' },
          { label: 'Shelves', value: distinct(rows, 'shelf'), note: 'with sold-out books', tone: 'ink' },
        ],
        chart: shelfBars(rows, 'Sold out by shelf', 'orange'),
      }),
    },
    {
      key: 'shelf', count: 'Shelves', bars: true, icon: Warehouse, name: 'Inventory by shelf', desc: 'Books, units on Shopify and waiting entries per shelf.', current: true,
      columns: [text('Shelf', 'code'), tag('Status', 'statusText'), number('Books', 'titles'), number('Units', 'units'), number('Waiting', 'waiting'), number('Pending', 'pending')],
      rows: data.byShelf.map((s) => ({ ...s, statusText: statusText(s.status) })),
      summary: (rows) => {
        const top = [...rows].sort((a, b) => b.units - a.units).slice(0, 10)
        const empty = rows.filter((s) => !s.units).length
        return {
          tiles: [
            { label: 'Shelves', value: rows.length, note: `${empty} without stock`, tone: 'ink' },
            { label: 'Books', value: total(rows, 'titles'), note: 'titles on the shelves', tone: 'brand' },
            { label: 'Units', value: total(rows, 'units'), note: 'copies on Shopify', tone: 'green' },
            { label: 'Waiting', value: total(rows, 'waiting'), note: 'waiting-list entries', tone: 'violet' },
            { label: 'Pending', value: total(rows, 'pending'), note: 'waiting for review', tone: 'orange' },
          ],
          chart: { type: 'bar', title: 'Units by shelf (top 10)', categories: top.map((s) => s.code), series: [{ name: 'Units', values: top.map((s) => s.units), tone: 'brand' }] },
          highlights: [
            top[0]?.units && { label: 'Fullest shelf', value: `${top[0].code} — ${plural(top[0].units, 'unit')} on Shopify` },
            { label: 'Empty shelves', value: empty ? `${plural(empty, 'shelf', 'shelves')} with no stock` : 'Every shelf has stock' },
          ].filter(Boolean),
        }
      },
    },
    {
      key: 'staff', count: 'Staff', bars: true, icon: Users, name: 'Staff activity', desc: 'Submissions, approvals, rejections and approval rate per staff member.',
      columns: [text('Staff', 'name'), number('Submitted', 'submitted'), number('Approved', 'approved'), number('Rejected', 'rejected'), number('Waiting', 'waiting'), number('Approval rate %', 'rate', { total: false })],
      rows: data.staffRows,
      summary: (rows) => {
        const approved = total(rows, 'approved')
        const rejected = total(rows, 'rejected')
        const active = rows.filter((s) => s.submitted > 0)
        const top = [...active].sort((a, b) => b.submitted - a.submitted).slice(0, 10)
        const best = [...rows].filter((s) => s.submitted >= 5 && s.rate != null).sort((a, b) => b.rate - a.rate)[0]
        return {
          tiles: [
            { label: 'Staff', value: rows.length, note: `${active.length} added books`, tone: 'ink' },
            { label: 'Submitted', value: total(rows, 'submitted'), note: `${(total(rows, 'submitted') / (active.length || 1)).toFixed(1)} per active member`, tone: 'brand' },
            { label: 'Approved', value: approved, note: 'went live on Shopify', tone: 'green' },
            { label: 'Rejected', value: rejected, note: 'incl. duplicate check', tone: 'red' },
            { label: 'Approval rate', value: approved + rejected ? approved / (approved + rejected) : null, format: 'percent', note: 'of reviewed books', tone: 'violet' },
          ],
          chart: top.length
            ? { type: 'bar', title: 'Submitted and approved', categories: top.map((s) => s.name), series: [{ name: 'Submitted', values: top.map((s) => s.submitted), tone: 'brand' }, { name: 'Approved', values: top.map((s) => s.approved), tone: 'green' }] }
            : null,
          highlights: [
            top[0] && { label: 'Most submissions', value: `${top[0].name} — ${plural(top[0].submitted, 'book')}` },
            best && { label: 'Best approval rate', value: `${best.name} — ${best.rate}% approved, ${plural(best.submitted, 'book')} submitted` },
          ].filter(Boolean),
        }
      },
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
