import { Suspense, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Activity, BarChart3, Bell, BookCopy, CheckCircle2, ChevronDown, Clock3, Hourglass, LayoutDashboard, LogOut, Menu as MenuIcon,
  Ellipsis, Flag, Search, Settings, Smartphone, Users, Warehouse, X, XCircle,
} from 'lucide-react'
import { Logo } from './Logo'
import { CommandSearch } from './CommandSearch'
import { DemoBadge } from './DemoControls'
import { Avatar, Menu, MenuItem } from '../ui/Misc'
import { IconButton } from '../ui/Button'
import { CountBadge } from '../ui/Status'
import { Skeleton } from '../ui/Feedback'
import { useAuth } from '../../hooks/useAuth'
import { useMediaQuery, useSelector, useTicker } from '../../hooks/useStore'
import { Drawer } from '../ui/Overlay'
import { selectors } from '../../services/mockApi'
import { cn, formatTime } from '../../utils/format'

const NAV = [
  { group: 'Overview', items: [{ to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
  {
    group: 'Inventory',
    items: [
      { to: '/admin/pending', label: 'Pending', icon: Clock3, count: 'pending' },
      { to: '/admin/waiting-list', label: 'Waiting & stock', icon: Hourglass, count: 'ready' },
      { to: '/admin/approved', label: 'Approved', icon: CheckCircle2 },
      { to: '/admin/rejected', label: 'Rejected', icon: XCircle },
      { to: '/admin/live', label: 'Live inventory', icon: BookCopy },
      { to: '/admin/flags', label: 'Flags', icon: Flag, count: 'flagged' },
    ],
  },
  {
    group: 'Management',
    items: [
      { to: '/admin/shelves', label: 'Shelves', icon: Warehouse },
      { to: '/admin/staff', label: 'Staff', icon: Users },
    ],
  },
  {
    group: 'Operations',
    items: [
      { to: '/admin/notifications', label: 'Notifications', icon: Bell, count: 'unread' },
      { to: '/admin/activity', label: 'Activity log', icon: Activity },
      { to: '/admin/reports', label: 'Reports', icon: BarChart3 },
    ],
  },
  { group: 'Settings', items: [{ to: '/admin/settings', label: 'Settings', icon: Settings }] },
]

const TITLES = [
  ['/admin/pending/', 'Review submission'],
  ['/admin/books/', 'Book detail'],
  ['/admin/pending', 'Pending review'],
  ['/admin/waiting-list', 'Waiting list & stock'],
  ['/admin/approved', 'Approved'],
  ['/admin/rejected', 'Rejected'],
  ['/admin/live', 'Live inventory'],
  ['/admin/flags', 'Content flags'],
  ['/admin/shelves', 'Shelves'],
  ['/admin/staff', 'Staff'],
  ['/admin/notifications', 'Notifications'],
  ['/admin/activity', 'Activity log'],
  ['/admin/reports', 'Reports'],
  ['/admin/settings', 'Settings'],
  ['/admin', 'Dashboard'],
]

function Sidebar({ onNavigate }) {
  const { user } = useAuth()
  const counts = useSelector(() => ({ ...selectors.navCounts(), unread: selectors.unreadCount(user) }))
  const shop = useSelector(() => selectors.shopify())
  useTicker(30_000)
  return (
    <div className="sidebar__inner">
      <div className="sidebar__brand">
        <Logo tone="light" sub="Inventory" />
      </div>
      <nav className="sidebar__nav" aria-label="Admin">
        {NAV.map((g) => (
          <div className="navgroup" key={g.group}>
            <span className="navgroup__label">{g.group}</span>
            <ul>
              {g.items.map((it) => (
                <li key={it.to}>
                  <NavLink to={it.to} end={it.end} className={({ isActive }) => cn('navlink', isActive && 'is-active')} onClick={onNavigate}>
                    <it.icon size={17} aria-hidden strokeWidth={2} />
                    <span>{it.label}</span>
                    {it.count && <CountBadge value={counts[it.count]} tone={it.count === 'ready' ? 'hero' : it.count === 'oos' ? 'warn' : it.count === 'unread' ? 'signal' : it.count === 'flagged' ? 'flag' : 'neutral'} />}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <NavLink to="/admin/settings#shopify" className="sidebar__shop" onClick={onNavigate}>
        <span className="sidebar__shop-head">
          <span className="live-dot" aria-hidden /> Shopify · {shop.health === 'healthy' ? 'Healthy' : 'Degraded'}
        </span>
        <span className="sidebar__shop-sub">
          Stock check every {shop.pollMinutes} min · last {formatTime(shop.lastPollAt)}
        </span>
        <span className="sidebar__shop-mock">Demo / mock integration</span>
      </NavLink>
    </div>
  )
}

const TABS = [
  { to: '/admin', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/admin/pending', label: 'Pending', icon: Clock3, count: 'pending' },
  { to: '/admin/waiting-list', label: 'Waiting', icon: Hourglass, count: 'ready' },
  { to: '/admin/live', label: 'Live', icon: BookCopy },
]
const TAB_PATHS = TABS.map((t) => t.to)

/** Phone layout: app-style bottom tabs, everything else in the More sheet. */
function AdminTabbar({ onMore, moreOpen }) {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const counts = useSelector(() => ({ ...selectors.navCounts(), unread: selectors.unreadCount(user) }))
  const inMore = !TAB_PATHS.some((p) => (p === '/admin' ? pathname === '/admin' : pathname.startsWith(p)))
  return (
    <nav className="tabbar tabbar--admin" aria-label="Admin">
      {/* Order: Pending, Waiting, raised Home (centre, like the staff Scan button), Stock, More */}
      {[TABS[1], TABS[2], TABS[0], TABS[3]].map((t) =>
        t.to === '/admin' ? (
          <NavLink key={t.to} to={t.to} end className={({ isActive }) => cn('tabbar__scan', isActive && 'is-active')} aria-label="Dashboard home">
            <t.icon size={26} strokeWidth={2.2} aria-hidden />
            <span>{t.label}</span>
          </NavLink>
        ) : (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => cn('tabbar__item', isActive && 'is-active')}>
            <span className="tabbar__icon">
              <t.icon size={21} aria-hidden />
              {t.count && counts[t.count] > 0 && <span className={cn('tabbar__dot', t.count === 'ready' && 'tabbar__dot--hero')}>{counts[t.count] > 9 ? '9+' : counts[t.count]}</span>}
            </span>
            <span>{t.label}</span>
          </NavLink>
        ),
      )}
      <button className={cn('tabbar__item', (inMore || moreOpen) && 'is-active')} onClick={onMore} aria-haspopup="dialog" aria-expanded={moreOpen}>
        <span className="tabbar__icon">
          <Ellipsis size={21} aria-hidden />
          {(counts.flagged > 0 || counts.unread > 0) && <span className="tabbar__dot tabbar__dot--mini" aria-label="Has updates" />}
        </span>
        <span>More</span>
      </button>
    </nav>
  )
}

function MoreSheet({ open, onClose }) {
  const { user, signIn, signOut } = useAuth()
  const navigate = useNavigate()
  const counts = useSelector(() => ({ ...selectors.navCounts(), unread: selectors.unreadCount(user) }))
  const shop = useSelector(() => selectors.shopify())
  const go = (to) => {
    onClose()
    navigate(to)
  }
  const groups = NAV.filter((g) => g.group !== 'Overview').map((g) => ({ ...g, items: g.items.filter((i) => !TAB_PATHS.includes(i.to)) })).filter((g) => g.items.length)
  return (
    <Drawer open={open} onClose={onClose} title="Menu" subtitle={`${user.name} · ${user.title}`} className="moresheet">
      {groups.map((g) => (
        <section key={g.group} className="moresheet__group">
          <h3 className="moresheet__label">{g.group}</h3>
          <div className="moresheet__grid">
            {g.items.map((it) => (
              <button key={it.to} className="moresheet__tile" onClick={() => go(it.to)}>
                <span className="moresheet__icon">
                  <it.icon size={19} aria-hidden />
                  {it.count && counts[it.count] > 0 && <span className={cn('tabbar__dot', it.count === 'flagged' && 'tabbar__dot--flag')}>{counts[it.count]}</span>}
                </span>
                <span>{it.label}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
      <button className="moresheet__shop" onClick={() => go('/admin/settings')}>
        <span className="live-dot" aria-hidden />
        <span>
          <strong>Shopify · {shop.health === 'healthy' ? 'Healthy' : 'Degraded'}</strong>
          <em>
            Stock check every {shop.pollMinutes} min · last {formatTime(shop.lastPollAt)} · demo / mock
          </em>
        </span>
      </button>
      <div className="moresheet__actions">
        <button
          className="moresheet__row"
          onClick={async () => {
            onClose()
            await signIn({ role: 'staff' })
            navigate('/staff')
          }}
        >
          <Smartphone size={18} aria-hidden /> Switch to Staff app (demo)
        </button>
        <button
          className="moresheet__row is-danger"
          onClick={() => {
            onClose()
            signOut()
            navigate('/login')
          }}
        >
          <LogOut size={18} aria-hidden /> Sign out
        </button>
      </div>
    </Drawer>
  )
}

export function AdminLayout() {
  const { user, signOut, signIn } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [drawer, setDrawer] = useState(false)
  const [search, setSearch] = useState(false)
  const [more, setMore] = useState(false)
  const phone = useMediaQuery('(max-width: 760px)')
  const unread = useSelector(() => selectors.unreadCount(user))
  const title = TITLES.find(([p]) => pathname.startsWith(p))?.[1] ?? 'BookHero'

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearch(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    document.title = `${title} · BookHero`
  }, [title])

  return (
    <div className={cn('admin', phone && 'admin--phone')}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Sidebar">
        <Sidebar />
      </aside>
      {drawer && (
        <div className="sidebar-drawer" onPointerDown={(e) => e.target === e.currentTarget && setDrawer(false)}>
          <aside className="sidebar sidebar--drawer">
            <button className="sidebar__close icon-btn" onClick={() => setDrawer(false)} aria-label="Close menu">
              <X size={18} />
            </button>
            <Sidebar onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}
      <div className="admin__main">
        <header className="topbar">
          <IconButton icon={MenuIcon} label="Open menu" className="topbar__menu" onClick={() => setDrawer(true)} />
          <div className="topbar__mobile-logo">
            <Logo size={40} withWord={false} />
          </div>
          <h1 className="topbar__title">{title}</h1>
          {phone ? (
            <IconButton icon={Search} label="Search books" className="topbar__search-icon" onClick={() => setSearch(true)} />
          ) : (
            <button className="topbar__search" onClick={() => setSearch(true)}>
              <span className="topbar__search-text">Search title, author, ISBN or shelf</span>
              <kbd className="kbd">Ctrl K</kbd>
            </button>
          )}
          <div className="topbar__right">
            <DemoBadge />
            <IconButton icon={Bell} label={`Notifications${unread ? `, ${unread} unread` : ''}`} badge={unread} onClick={() => navigate('/admin/notifications')} className="topbar__bell" />
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
              <MenuItem icon={Settings} onClick={() => navigate('/admin/settings')}>
                Profile & settings
              </MenuItem>
              <MenuItem
                icon={Smartphone}
                onClick={async () => {
                  await signIn({ role: 'staff' })
                  navigate('/staff')
                }}
              >
                Switch to Staff app (demo)
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
        <main id="main" className="admin__content" tabIndex={-1}>
          <Suspense fallback={<PageFallback />}>
            <div key={pathname.split('/').slice(0, 3).join('/')} className="page-enter">
              <Outlet />
            </div>
          </Suspense>
        </main>
      </div>
      {phone && <AdminTabbar onMore={() => setMore(true)} moreOpen={more} />}
      {phone && <MoreSheet open={more} onClose={() => setMore(false)} />}
      <CommandSearch open={search} onClose={() => setSearch(false)} />
    </div>
  )
}

function PageFallback() {
  return (
    <div className="page-fallback" aria-busy="true">
      <Skeleton w={220} h={26} />
      <Skeleton w={340} h={12} />
      <Skeleton w="100%" h={260} r={8} />
    </div>
  )
}
