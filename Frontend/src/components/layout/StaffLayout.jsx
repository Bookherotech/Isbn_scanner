import { Suspense } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Bell, ChevronDown, House, Keyboard, LayoutDashboard, Layers, LogOut, ScanLine, UserRound } from 'lucide-react'
import { Logo } from './Logo'
import { DemoBadge } from './DemoControls'
import { useAuth } from '../../hooks/useAuth'
import { useMediaQuery, useSelector } from '../../hooks/useStore'
import { getLastShelf } from '../../hooks/useDraft'
import { selectors } from '../../services/mockApi'
import { Skeleton } from '../ui/Feedback'
import { Avatar, Menu, MenuItem } from '../ui/Misc'
import { IconButton } from '../ui/Button'
import { CountBadge, ShelfTag } from '../ui/Status'
import { cn } from '../../utils/format'

const FLOW = ['/staff/scan', '/staff/manual-isbn', '/staff/book', '/staff/shelf', '/staff/review']
const TITLES = [
  ['/staff/scan', 'Scan ISBN'],
  ['/staff/manual-isbn', 'Enter ISBN'],
  ['/staff/book', 'Book details'],
  ['/staff/shelf', 'Shelf & quantity'],
  ['/staff/review', 'Review submission'],
  ['/staff/submissions', 'My submissions'],
  ['/staff/notifications', 'Alerts'],
  ['/staff/profile', 'Profile'],
  ['/staff', 'Home'],
]

/**
 * Staff app — layout follows the screen size, like the admin dashboard:
 * phones get the mobile PWA (tab bar, full-screen flows), desktop gets a full workspace.
 */
export function StaffLayout() {
  const desktop = useMediaQuery('(min-width: 900px)')
  return desktop ? <StaffDesktop /> : <StaffPhone />
}

function PageFallback() {
  return (
    <div className="page-fallback" style={{ padding: 20 }}>
      <Skeleton w={160} h={22} />
      <Skeleton w="100%" h={120} r={10} />
    </div>
  )
}

function StaffDesktop() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, signIn, signOut } = useAuth()
  const unread = useSelector(() => selectors.unreadCount(user))
  const inFlow = FLOW.some((p) => pathname.startsWith(p))
  const title = TITLES.find(([p]) => pathname.startsWith(p))?.[1] ?? 'BookHero'
  const lastShelf = getLastShelf()
  const nav = (to, label, Icon, extra) => (
    <li>
      <NavLink to={to} end={to === '/staff'} className={({ isActive }) => cn('navlink', isActive && 'is-active', extra?.hero && 'navlink--hero')}>
        <Icon size={17} aria-hidden strokeWidth={2} />
        <span>{label}</span>
        {extra?.count ? <CountBadge value={extra.count} tone="signal" /> : null}
      </NavLink>
    </li>
  )

  return (
    <div className="admin staff-desk">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Sidebar">
        <div className="sidebar__inner">
          <div className="sidebar__brand">
            <Logo tone="light" sub="Staff app" />
          </div>
          <nav className="sidebar__nav" aria-label="Staff">
            <div className="navgroup">
              <span className="navgroup__label">Work</span>
              <ul>
                {nav('/staff/scan', 'Scan book', ScanLine, { hero: true })}
                {nav('/staff', 'Home', House)}
                {nav('/staff/manual-isbn', 'Enter ISBN', Keyboard)}
                {nav('/staff/submissions', 'My submissions', Layers)}
              </ul>
            </div>
            <div className="navgroup">
              <span className="navgroup__label">Account</span>
              <ul>
                {nav('/staff/notifications', 'Alerts', Bell, { count: unread })}
                {nav('/staff/profile', 'Profile', UserRound)}
              </ul>
            </div>
          </nav>
          {lastShelf && (
            <div className="sidebar__shop sidebar__shop--static">
              <span className="sidebar__shop-sub">Working on shelf</span>
              <ShelfTag id={lastShelf} />
            </div>
          )}
        </div>
      </aside>
      <div className="admin__main">
        <header className="topbar">
          <h1 className="topbar__title">{title}</h1>
          <div className="topbar__right" style={{ marginLeft: 'auto' }}>
            <DemoBadge />
            <IconButton icon={Bell} label={`Alerts${unread ? `, ${unread} unread` : ''}`} badge={unread} onClick={() => navigate('/staff/notifications')} />
            <Menu
              trigger={({ toggle, props }) => (
                <button className="usermenu" onClick={toggle} {...props}>
                  <Avatar name={user.name} hue={user.hue} size={30} />
                  <span className="usermenu__text">
                    <strong>{user.name}</strong>
                    <span>{user.title}</span>
                  </span>
                  <ChevronDown size={15} aria-hidden />
                </button>
              )}
            >
              <div className="menu__header">
                <strong>{user.name}</strong>
                <span>{user.email}</span>
              </div>
              <MenuItem icon={UserRound} onClick={() => navigate('/staff/profile')}>
                Profile
              </MenuItem>
              <MenuItem
                icon={LayoutDashboard}
                onClick={async () => {
                  await signIn({ role: 'admin' })
                  navigate('/admin')
                }}
              >
                Switch to Admin (demo)
              </MenuItem>
              <MenuItem
                icon={LogOut}
                danger
                onClick={() => {
                  signOut()
                  navigate('/login')
                }}
              >
                Sign out
              </MenuItem>
            </Menu>
          </div>
        </header>
        <main id="main" className={cn('staff-desk__content', inFlow && 'is-flow', pathname.startsWith('/staff/scan') && 'is-scan')} tabIndex={-1}>
          <Suspense fallback={<PageFallback />}>
            <div key={pathname} className={cn('staff-page', !inFlow && 'page-enter')}>
              <Outlet />
            </div>
          </Suspense>
        </main>
      </div>
    </div>
  )
}

function StaffPhone() {
  const { pathname } = useLocation()
  const { user } = useAuth()
  const unread = useSelector(() => selectors.unreadCount(user))
  const inFlow = FLOW.some((p) => pathname.startsWith(p))

  return (
    <div className="staff-stage">
      <div className={cn('phone', inFlow && 'phone--flow')}>
        {!inFlow && (
          <header className="s-appbar">
            <Logo size={40} withWord={false} />
            <span className="s-appbar__title">{TITLES.find(([p]) => pathname.startsWith(p))?.[1] ?? 'BookHero'}</span>
            <DemoBadge floating />
          </header>
        )}
        <div className="phone__screen" id="main">
          <Suspense fallback={<PageFallback />}>
            <div key={pathname} className={cn('staff-page', !inFlow && 'page-enter')}>
              <Outlet />
            </div>
          </Suspense>
        </div>
        {!inFlow && (
          <nav className="tabbar" aria-label="Staff">
            <NavLink to="/staff" end className={({ isActive }) => cn('tabbar__item', isActive && 'is-active')}>
              <House size={21} aria-hidden />
              <span>Home</span>
            </NavLink>
            <NavLink to="/staff/submissions" className={({ isActive }) => cn('tabbar__item', isActive && 'is-active')}>
              <Layers size={21} aria-hidden />
              <span>Submissions</span>
            </NavLink>
            <NavLink to="/staff/scan" className="tabbar__scan" aria-label="Scan a book">
              <ScanLine size={26} strokeWidth={2.2} aria-hidden />
              <span>Scan</span>
            </NavLink>
            <NavLink to="/staff/notifications" className={({ isActive }) => cn('tabbar__item', isActive && 'is-active')}>
              <span className="tabbar__icon">
                <Bell size={21} aria-hidden />
                {unread > 0 && <span className="tabbar__dot">{unread > 9 ? '9+' : unread}</span>}
              </span>
              <span>Alerts</span>
            </NavLink>
            <NavLink to="/staff/profile" className={({ isActive }) => cn('tabbar__item', isActive && 'is-active')}>
              <UserRound size={21} aria-hidden />
              <span>Profile</span>
            </NavLink>
          </nav>
        )}
      </div>
    </div>
  )
}
