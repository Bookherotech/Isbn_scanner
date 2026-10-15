import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Copy, FastForward, FlaskConical, PackageCheck, PackageX, Radar, RotateCcw, ShieldCheck, Smartphone, LayoutDashboard, WifiOff } from 'lucide-react'
import { Drawer, Modal } from '../ui/Overlay'
import { Button } from '../ui/Button'
import { Select, Checkbox } from '../ui/Form'
import { StageList, useStages } from '../ui/Feedback'
import { demo, selectors } from '../../services/mockApi'
import { DEMO_ISBNS } from '../../services/catalog'
import { useAuth } from '../../hooks/useAuth'
import { useSelector } from '../../hooks/useStore'
import { useToast } from '../../hooks/useToast'
import { cn, longDate, formatTime } from '../../utils/format'

const OPEN_EVENT = 'bookhero:open-demo'

/** Subtle, professional indicator — opens the presenter's controls. */
export function DemoBadge({ floating }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (floating) return
    const onOpen = () => setOpen(true)
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [floating])
  return (
    <>
      <button className={cn('demo-badge', floating && 'demo-badge--floating')} onClick={() => setOpen(true)} aria-label="Demo environment — open demo controls">
        <span className="demo-badge__stripe" aria-hidden />
        <span className="demo-badge__text">Demo environment</span>
      </button>
      <DemoPanel open={open} onClose={() => setOpen(false)} />
    </>
  )
}

export const openDemoPanel = () => window.dispatchEvent(new Event(OPEN_EVENT))

const SCENARIOS = [
  { n: 1, title: 'Normal submission', path: 'Staff → Scan → Great Gatsby (Penguin) → shelf A-12, qty 3 → Submit', result: 'Pending', role: 'staff', to: '/staff/scan' },
  { n: 2, title: 'Admin approval', path: 'Admin → Pending → open the book → edit if needed → Approve', result: 'Live on Shopify', role: 'admin', to: '/admin/pending' },
  { n: 3, title: 'Same shelf duplicate', path: 'Staff → Scan → Great Gatsby (Scribner, different ISBN) → A-12', result: 'Rejected', role: 'staff', to: '/staff/scan' },
  { n: 4, title: 'Different shelf', path: 'Staff → Scan → Great Gatsby (Scribner) → B-04', result: 'Waiting list', role: 'staff', to: '/staff/scan' },
  { n: 5, title: 'Admin rejection', path: 'Admin → Pending → Reject → choose a reason', result: 'Rejected', role: 'admin', to: '/admin/pending' },
  { n: 6, title: 'Stock out', path: 'Demo controls → Simulate stock-out → The Great Gatsby', result: 'Out of stock + push', role: 'admin', to: '/admin/waiting-list?tab=stock' },
  { n: 7, title: 'Waiting-list approval', path: 'Admin → Waiting list → Ready → Review & approve', result: 'Same product, new shelf', role: 'admin', to: '/admin/waiting-list' },
  { n: 8, title: 'Content flag (staff)', path: 'Staff → Scan → The Song of Achilles → any shelf → Submit', result: 'Pending + flagged', role: 'staff', to: '/staff/scan' },
  { n: 9, title: 'Content flag (admin)', path: 'Admin → Flags → Needs review → open → Mark reviewed / Approve', result: 'Reviewed', role: 'admin', to: '/admin/flags' },
]

function DemoPanel({ open, onClose }) {
  const { user, signIn } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const flags = useSelector(() => selectors.demoFlags())
  const clock = useSelector(() => selectors.clock())
  const candidates = useSelector(() => (open ? demo.stockOutCandidates() : []))
  const oosItems = useSelector(() => (open ? demo.outOfStockItems() : []))
  const [target, setTarget] = useState('')
  const [restockTarget, setRestockTarget] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  const stages = useStages()
  const [busy, setBusy] = useState('')

  const gatsby = candidates.find((c) => c.title === 'The Great Gatsby')
  const chosen = target || gatsby?.id || candidates[0]?.id || ''
  const chosenItem = candidates.find((c) => c.id === chosen)

  const switchRole = async (role, to) => {
    if (user?.role !== role) await signIn({ role })
    onClose()
    navigate(to || (role === 'admin' ? '/admin' : '/staff'))
  }

  const simulateStockOut = async () => {
    if (!chosenItem) return
    try {
      const res = await stages.run(
        [`Selling remaining ${chosenItem.stock} unit${chosenItem.stock === 1 ? '' : 's'} on Shopify (demo)`, 'Scheduled stock check polls Shopify', 'Stock-out detected · push #1 to admin + staff'],
        async () => {
          await demo.sellOut(chosenItem.id)
          return demo.runStockPoll()
        },
        { stepMs: 500 },
      )
      const d = res.detected[0]
      toast({
        title: `${d?.title ?? chosenItem.title} is out of stock`,
        description: d?.ready.length ? `Waiting-list entry on ${d.ready.join(', ')} is now ready for approval.` : `Push sent to ${res.recipients} people.`,
        tone: 'warning',
      })
    } catch {
      /* stage list shows error */
    }
  }

  const run = async (key, fn, done) => {
    setBusy(key)
    try {
      const r = await fn()
      done?.(r)
    } finally {
      setBusy('')
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Demo controls" subtitle="Presenter tools — not part of the product UI" width={480} className="demo-panel">
      <section className="demo-sec">
        <div className="demo-note">
          <ShieldCheck size={18} aria-hidden />
          <p>
            This prototype runs on <strong>mock data</strong>. ISBN lookup, Shopify, the 10-minute stock check and browser push are <strong>simulated</strong>. The screens and the workflow are the intended product.
          </p>
        </div>
      </section>

      <section className="demo-sec">
        <h3 className="demo-sec__title">View as</h3>
        <div className="demo-roles">
          <button className={cn('demo-role', user?.role === 'staff' && 'is-active')} onClick={() => switchRole('staff')}>
            <Smartphone size={18} aria-hidden />
            <span>
              <strong>Staff app</strong>
              <em>Sarah Wilson · mobile PWA</em>
            </span>
          </button>
          <button className={cn('demo-role', user?.role === 'admin' && 'is-active')} onClick={() => switchRole('admin')}>
            <LayoutDashboard size={18} aria-hidden />
            <span>
              <strong>Admin dashboard</strong>
              <em>Rachel Morgan · Super Admin</em>
            </span>
          </button>
        </div>
      </section>

      <section className="demo-sec">
        <h3 className="demo-sec__title">Client story · 7 scenarios</h3>
        <ol className="demo-story">
          {SCENARIOS.map((s) => (
            <li key={s.n}>
              <button onClick={() => switchRole(s.role, s.to)}>
                <span className="demo-story__n">{s.n}</span>
                <span className="demo-story__text">
                  <strong>{s.title}</strong>
                  <em>{s.path}</em>
                </span>
                <span className="demo-story__res">{s.result}</span>
              </button>
            </li>
          ))}
        </ol>
      </section>

      <section className="demo-sec">
        <h3 className="demo-sec__title">Stock simulation</h3>
        <label className="demo-label" htmlFor="demo-target">
          Live book
        </label>
        <Select id="demo-target" value={chosen} onChange={(e) => setTarget(e.target.value)}>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title} · {c.shelfId} · stock {c.stock}
              {c.waiting ? ` · ${c.waiting} waiting` : ''}
            </option>
          ))}
        </Select>
        <div className="demo-actions">
          <Button variant="dark" icon={PackageX} onClick={simulateStockOut} loading={stages.active} disabled={!chosenItem}>
            Simulate stock-out
          </Button>
          <Button icon={Radar} loading={busy === 'poll'} onClick={() => run('poll', demo.runStockPoll, (r) => toast({ title: 'Stock check complete', description: r.detected.length ? `${r.detected.length} stock-out detected.` : 'No stock changes on Shopify.', tone: 'info' }))}>
            Run stock check now
          </Button>
        </div>
        {stages.labels.length > 0 && <StageList {...stages} className="demo-stages" />}

        <div className="demo-row">
          <div>
            <strong>24-hour re-check</strong>
            <p className="muted">Demo clock: {longDate(clock)}, {formatTime(clock)}. Fast-forward sends push #2 for books still out of stock.</p>
          </div>
          <Button
            icon={FastForward}
            loading={busy === 'clock'}
            onClick={() =>
              run('clock', () => demo.advanceClock(24), (r) =>
                toast({ title: 'Clock moved forward 24 hours', description: r.reminders.length ? `Reminder push sent for ${r.reminders.join(', ')}.` : 'No books needed a reminder.', tone: 'info' }),
              )
            }
          >
            +24 h
          </Button>
        </div>
        {oosItems.length > 0 && (
          <div className="demo-row demo-row--stack">
            <strong>Restock in Shopify (cancels the 24 h reminder)</strong>
            <div className="demo-inline">
              <Select value={restockTarget || oosItems[0].id} onChange={(e) => setRestockTarget(e.target.value)} aria-label="Out-of-stock book">
                {oosItems.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title} · {o.shelfId}
                  </option>
                ))}
              </Select>
              <Button icon={PackageCheck} loading={busy === 'restock'} onClick={() => run('restock', () => demo.restock(restockTarget || oosItems[0].id), () => toast({ title: 'Restocked', description: 'Book is live again; reminder cancelled.' }))}>
                Restock
              </Button>
            </div>
          </div>
        )}
      </section>

      <section className="demo-sec">
        <h3 className="demo-sec__title">Demo ISBNs</h3>
        <ul className="demo-isbns">
          {DEMO_ISBNS.map((d) => (
            <li key={d.isbn}>
              <span className="mono">{d.isbn}</span>
              <span>
                <strong>{d.label}</strong> — {d.note}
              </span>
              <button className="icon-btn icon-btn--sm" aria-label={`Copy ${d.isbn}`} onClick={() => navigator.clipboard?.writeText(d.isbn).then(() => toast({ title: 'ISBN copied', tone: 'info', duration: 1600 }))}>
                <Copy size={14} />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="demo-sec">
        <h3 className="demo-sec__title">Failure states</h3>
        <Checkbox label={<span className="demo-check"><WifiOff size={15} aria-hidden /> Simulate network failure (lists show error + retry)</span>} checked={flags.networkError} onChange={(e) => demo.setNetworkError(e.target.checked)} />
      </section>

      <section className="demo-sec demo-sec--last">
        <Button variant="danger-ghost" icon={RotateCcw} onClick={() => setConfirmReset(true)}>
          Reset demo data
        </Button>
        <p className="muted demo-fine">
          <FlaskConical size={13} aria-hidden /> Restores the original story: 11 pending (1 flagged), 6 waiting (2 ready), 5 out of stock.
        </p>
      </section>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset demo data?"
        description="All submissions, approvals and notifications made during this session will be discarded and the original demo story restored."
        size="sm"
        footer={
          <>
            <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
            <Button
              variant="danger"
              icon={RotateCcw}
              onClick={() => {
                demo.reset()
                setConfirmReset(false)
                stages.reset()
                toast({ title: 'Demo data reset', description: 'The original story is restored.' })
              }}
            >
              Reset data
            </Button>
          </>
        }
      />
    </Drawer>
  )
}
