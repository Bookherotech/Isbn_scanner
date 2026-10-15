import { useNavigate } from 'react-router-dom'
import { BellRing, LayoutDashboard, LogOut, Share, Smartphone } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useQuery } from '../../hooks/useStore'
import { getMySubmissions } from '../../services/mockApi'
import { Avatar } from '../../components/ui/Misc'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Feedback'

export default function Profile() {
  const { user, signOut, signIn } = useAuth()
  const navigate = useNavigate()
  const { data } = useQuery(() => getMySubmissions(user.id, { pageSize: 1 }), [user.id])
  const c = data?.counts

  return (
    <div className="s-page profile">
      <div className="profile__card">
        <Avatar name={user.name} hue={user.hue} size={64} />
        <div>
          <h1>{user.name}</h1>
          <p className="muted">
            {user.title} · @{user.username}
          </p>
        </div>
      </div>
      <dl className="profile__stats">
        {[
          ['Submitted', c?.all],
          ['Live', (c?.live ?? 0) + (c?.out_of_stock ?? 0)],
          ['Waiting', c?.waiting],
          ['Rejected', c?.rejected],
        ].map(([l, v]) => (
          <div key={l}>
            <dt>{l}</dt>
            <dd className="num">{c ? v ?? 0 : <Skeleton w={24} h={18} />}</dd>
          </div>
        ))}
      </dl>

      <section className="profile__sec">
        <h2>Notifications</h2>
        <div className="profile__row">
          <BellRing size={19} aria-hidden />
          <div>
            <strong>Push notifications</strong>
            <span>On · stock-outs, 24-hour reminders and review results (simulated in this demo)</span>
          </div>
          <span className="toggle is-on" aria-hidden />
        </div>
        <div className="profile__row">
          <Share size={19} aria-hidden />
          <div>
            <strong>iPhone: add to Home Screen</strong>
            <span>In Safari tap Share → Add to Home Screen. iOS only delivers push to installed apps.</span>
          </div>
        </div>
        <div className="profile__row">
          <Smartphone size={19} aria-hidden />
          <div>
            <strong>Android: install app</strong>
            <span>Chrome shows “Install BookHero” — scanning works best from the installed app.</span>
          </div>
        </div>
      </section>

      <section className="profile__sec">
        <h2>Demo</h2>
        <Button
          block
          icon={LayoutDashboard}
          onClick={async () => {
            await signIn({ role: 'admin' })
            navigate('/admin')
          }}
        >
          Switch to Admin dashboard
        </Button>
        <Button
          block
          variant="danger-ghost"
          icon={LogOut}
          onClick={() => {
            signOut()
            navigate('/login')
          }}
        >
          Sign out
        </Button>
      </section>
    </div>
  )
}
