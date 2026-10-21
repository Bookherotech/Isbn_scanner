import { useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
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
      </div>

      <section className="profile__sec">
        <h2>Your details</h2>
        <ProfileDetails />
      </section>

      <section className="profile__sec">
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
