import { Link } from 'react-router-dom'
import { ChevronRight, Keyboard, ScanLine } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useQuery, useTicker } from '../../hooks/useStore'
import { getStaffHome } from '../../services/mockApi'
import { getLastShelf } from '../../hooks/useDraft'
import { Avatar, Barcode } from '../../components/ui/Misc'
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback'
import { ShelfTag } from '../../components/ui/Status'
import { SubmissionCard } from '../../components/staff/StaffBits'
import { clockNow, firstName, greeting, longDate } from '../../utils/format'

export default function StaffHome() {
  const { user } = useAuth()
  const { data, loading, error, reload } = useQuery(() => getStaffHome(user.id), [user.id])
  const lastShelf = getLastShelf()
  useTicker(60_000)

  return (
    <div className="s-home">
      <header className="s-head">
        <div>
          <span className="s-head__date">{longDate(clockNow())}</span>
          <h1 className="s-head__title">
            {greeting()}, {firstName(user.name)}
          </h1>
        </div>
        <Link to="/staff/profile" aria-label="Profile">
          <Avatar name={user.name} hue={user.hue} size={38} />
        </Link>
      </header>

      <section className="s-today" aria-label="Today">
        {loading
          ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} h={46} r={6} />)
          : data && [
              ['Scanned', data.today.scanned],
              ['Pending', data.today.pending],
              ['Approved', data.today.approved],
              ['Waiting', data.today.waiting],
            ].map(([l, v]) => (
              <div key={l} className="s-today__cell">
                <span className="s-today__val num">{v}</span>
                <span className="s-today__lbl">{l}</span>
              </div>
            ))}
      </section>

      <Link to="/staff/scan" className="scan-hero">
        <span className="scan-hero__frame" aria-hidden>
          <Barcode value="9780141182636" height={30} showText={false} />
          <span className="scan-hero__line" />
        </span>
        <span className="scan-hero__text">
          <span className="scan-hero__title">
            <ScanLine size={22} aria-hidden /> Scan book
          </span>
          <span className="scan-hero__sub">Point the camera at the barcode on the back cover</span>
        </span>
      </Link>

      <div className="s-quick">
        <Link to="/staff/manual-isbn" className="s-quick__btn">
          <Keyboard size={18} aria-hidden />
          <span>Enter ISBN manually</span>
          <ChevronRight size={17} aria-hidden className="s-quick__chev" />
        </Link>
        {lastShelf && (
          <div className="s-quick__shelf">
            <span className="muted">Working on</span> <ShelfTag id={lastShelf} size="sm" />
          </div>
        )}
      </div>

      <section className="s-section">
        <div className="s-section__head">
          <h2>Recent submissions</h2>
          <Link to="/staff/submissions" className="panel__link">
            See all
          </Link>
        </div>
        {loading ? (
          <div className="s-list">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} h={78} r={10} />
            ))}
          </div>
        ) : error ? (
          <ErrorState error={error} onRetry={reload} compact />
        ) : data.recent.length === 0 ? (
          <EmptyState art="books" title="No submissions yet" compact>
            Scan your first book to get started.
          </EmptyState>
        ) : (
          <div className="s-list">
            {data.recent.map((it) => (
              <SubmissionCard key={it.id} item={it} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
