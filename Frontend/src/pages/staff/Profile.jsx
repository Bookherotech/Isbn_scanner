import { useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { formatDate, formatDateTime } from '../../utils/format'
import { useAuth } from '../../hooks/useAuth'
import { Avatar } from '../../components/ui/Misc'
import { Button } from '../../components/ui/Button'
import ProfileDetails from './ProfileDetails'

export default function Profile() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="s-page profile">
      <div className="profile__card">
        <Avatar name={user.name} hue={user.hue} size={64} />
        <div>
          <h1>{user.name}</h1>
          <p className="muted">{user.role === 'admin' ? 'Super Admin' : 'Staff'}</p>
        </div>
        {/* Extra account facts: shown on large screens only (see .profile__meta in pages.css) */}
        <dl className="profile__meta">
          <div>
            <dt>Email</dt>
            <dd>{user.email || '—'}</dd>
          </div>
          <div>
            <dt>Member since</dt>
            <dd>{user.joinedAt ? formatDate(Date.parse(user.joinedAt), { year: 'numeric' }) : '—'}</dd>
          </div>
          <div>
            <dt>Last sign-in</dt>
            <dd>{user.lastLoginAt ? formatDateTime(Date.parse(user.lastLoginAt)) : '—'}</dd>
          </div>
        </dl>
      </div>

      <section className="profile__sec profile__sec--details">
        <h2>Your details</h2>
        <ProfileDetails />
      </section>

      <section className="profile__sec profile__sec--account">
        <h2>Account</h2>
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
