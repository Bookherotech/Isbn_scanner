import { useNavigate } from 'react-router-dom'
import { LogOut, ShieldCheck } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { formatDate, formatDateTime } from '../../utils/format'
import { Avatar, PageHeader, Panel } from '../../components/ui/Misc'
import { Button } from '../../components/ui/Button'
import ProfileDetails from '../staff/ProfileDetails'

/** The Super Admin's own profile: who they are, their details (name + phone editable), and sign out. */
export default function AdminProfile() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  return (
    <div>
      <PageHeader title="Profile" description="Your Super Admin account." />
      <div className="admin-profile">
        <Panel className="admin-profile__summary">
          <div className="admin-profile__who">
            <Avatar name={user.name} hue={user.hue} size={72} />
            <strong>{user.name}</strong>
            <span>{user.email}</span>
            <span className="state-pill is-on">Super Admin</span>
          </div>
          <dl className="admin-profile__facts">
            <div>
              <dt>Member since</dt>
              <dd>{user.joinedAt ? formatDate(Date.parse(user.joinedAt), { year: 'numeric' }) : '—'}</dd>
            </div>
            <div>
              <dt>Last sign-in</dt>
              <dd>{user.lastLoginAt ? formatDateTime(Date.parse(user.lastLoginAt)) : '—'}</dd>
            </div>
          </dl>
          <p className="admin-profile__note">
            <ShieldCheck size={16} aria-hidden />
            Every sign-in needs a 4-digit code sent to your email.
          </p>
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
        </Panel>

        <Panel title="Your details" className="admin-profile__details">
          <ProfileDetails />
        </Panel>
      </div>
    </div>
  )
}
