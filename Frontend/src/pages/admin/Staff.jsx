import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Crown, KeyRound, Pencil, Power, Trash2, UserPlus } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useQuery } from '../../hooks/useStore'
import { useToast } from '../../hooks/useToast'
import { deleteStaff, fetchStaff, updateStaff } from '../../services/authApi'
import { DataTable } from '../../components/ui/Data'
import { Avatar, PageHeader } from '../../components/ui/Misc'
import { Button, IconButton } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/Feedback'
import { Modal } from '../../components/ui/Overlay'
import { cn, timeAgo } from '../../utils/format'
import AddStaffForm from './AddStaffForm'
import ChangePasswordForm from './ChangePasswordForm'
import EditStaffForm from './EditStaffForm'
import AdminTransfer from './AdminTransfer'

const displayName = (u) => u.full_name || u.email

export default function Staff() {
  return (
    <div>
      <PageHeader
        eyebrow="Management"
        title="Staff"
        description="People who scan and submit books from the Staff app. Deactivated staff can’t sign in."
      />
      <StaffList />
    </div>
  )
}

function StaffList() {
  const { toast } = useToast()
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [transferTo, setTransferTo] = useState(null) // ...being made the Super Admin
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(null) // the staff member being edited
  const [toggling, setToggling] = useState(null) // ...being activated / deactivated
  const [deleting, setDeleting] = useState(null) // ...being deleted
  const [passwordFor, setPasswordFor] = useState(null) // ...getting a new password
  const [busy, setBusy] = useState(false)
  const [more, setMore] = useState({ rows: [], next: undefined, loading: false })
  const { data, loading, error, reload, refreshing } = useQuery(() => fetchStaff(), [])

  const rows = [...(data?.results || []), ...more.rows]
  const next = more.next === undefined ? data?.next : more.next

  const refresh = () => {
    setMore({ rows: [], next: undefined, loading: false })
    reload()
  }

  const loadMore = async () => {
    setMore((m) => ({ ...m, loading: true }))
    try {
      const page = await fetchStaff(next)
      setMore((m) => ({ rows: [...m.rows, ...page.results], next: page.next, loading: false }))
    } catch {
      setMore((m) => ({ ...m, loading: false }))
      toast({ title: 'Could not load more staff', tone: 'error' })
    }
  }

  const failure = (e, fallback) =>
    toast({ title: e.status === 404 ? 'That staff member no longer exists' : e.status === 0 ? 'Cannot reach the server' : fallback, tone: 'error' })

  const confirmToggle = async () => {
    const person = toggling
    setBusy(true)
    try {
      await updateStaff(person.id, { isActive: !person.is_active })
      toast({ title: `${displayName(person)} ${person.is_active ? 'deactivated' : 'activated'}`, tone: 'info' })
      setToggling(null)
      refresh()
    } catch (e) {
      failure(e, 'Could not change the status')
      setToggling(null)
      refresh()
    } finally {
      setBusy(false)
    }
  }

  const confirmDelete = async () => {
    const person = deleting
    setBusy(true)
    try {
      await deleteStaff(person.id)
      toast({ title: `${displayName(person)} deleted`, tone: 'info' })
      setDeleting(null)
      refresh()
    } catch (e) {
      failure(e, 'Could not delete the account')
      setDeleting(null)
      refresh()
    } finally {
      setBusy(false)
    }
  }

  const columns = [
    {
      key: 'name',
      header: 'Name',
      card: 'title',
      render: (u) => (
        <span className="person person--lg">
          <Avatar name={displayName(u)} hue={(u.id * 47) % 360} size={32} />
          <span>
            <strong>{displayName(u)}</strong>
            <span className="muted">{u.email}</span>
            {!u.email_verified && <span className="email-unverified">Email not verified</span>}
          </span>
        </span>
      ),
    },
    { key: 'phone', header: 'Phone', card: 'meta', render: (u) => <span className="td-mono">{u.phone_number || '—'}</span> },
    {
      key: 'status',
      header: 'Status',
      card: 'badge',
      render: (u) => (
        <button
          type="button"
          className={cn('state-pill', u.is_active ? 'is-on' : 'is-off')}
          title={u.is_active ? `Click to deactivate ${displayName(u)}` : `Click to activate ${displayName(u)}`}
          aria-label={`${displayName(u)} is ${u.is_active ? 'active' : 'inactive'}. ${u.is_active ? 'Deactivate' : 'Activate'}`}
          onClick={() => setToggling(u)}
        >
          {u.is_active ? 'Active' : 'Inactive'}
        </button>
      ),
    },
    { key: 'last', header: 'Last sign-in', card: 'meta', render: (u) => <span className="td-muted">{u.last_login ? timeAgo(Date.parse(u.last_login)) : 'Never'}</span> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      card: 'action',
      render: (u) => (
        <span className="row-actions">
          <IconButton icon={Pencil} label={`Edit ${displayName(u)}`} size={15} onClick={() => setEditing(u)} />
          <IconButton icon={KeyRound} label={`Change password for ${displayName(u)}`} size={15} onClick={() => setPasswordFor(u)} />
          {u.is_active && <IconButton icon={Crown} label={`Make ${displayName(u)} the Super Admin`} size={15} onClick={() => setTransferTo(u)} />}
          <IconButton icon={Trash2} label={`Delete ${displayName(u)}`} size={15} onClick={() => setDeleting(u)} />
        </span>
      ),
    },
  ]

  return (
    <>
      <div className="toolbar">
        <span style={{ flex: 1 }} />
        <Button variant="primary" icon={UserPlus} onClick={() => setAdding(true)}>
          Add staff
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        error={error}
        onRetry={reload}
        refreshing={refreshing}
        caption="Staff"
        empty={
          <EmptyState art="books" title="No staff yet" action={<Button variant="primary" icon={UserPlus} onClick={() => setAdding(true)}>Add staff</Button>}>
            Staff accounts you add will appear here.
          </EmptyState>
        }
      />
      {next && (
        <p style={{ textAlign: 'center', marginTop: 12 }}>
          <Button onClick={loadMore} loading={more.loading}>
            Load more
          </Button>
        </p>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Add staff member" description="Create a Staff account. They can sign in right away." size="sm">
        {adding && (
          <AddStaffForm
            onClose={() => setAdding(false)}
            onCreated={(created) => {
              setAdding(false)
              refresh()
              toast({ title: `${displayName(created)} added`, description: 'They can sign in with their email and password.' })
            }}
          />
        )}
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? `Edit ${displayName(editing)}` : ''} description="Change their name, phone or email." size="sm">
        {editing && (
          <EditStaffForm
            key={editing.id}
            staff={editing}
            onClose={() => setEditing(null)}
            onSaved={(saved) => {
              setEditing(null)
              refresh()
              toast({ title: `${displayName(saved)} updated` })
            }}
            onEmailChanged={(changed) => {
              setEditing(changed) // keep the dialog open with the new email
              refresh()
            }}
          />
        )}
      </Modal>

      <Modal open={!!passwordFor} onClose={() => setPasswordFor(null)} title={`Change password${passwordFor ? ` for ${displayName(passwordFor)}` : ''}`} description="Set a new password for this account." size="sm">
        {passwordFor && (
          <ChangePasswordForm
            key={passwordFor.id}
            staff={passwordFor}
            onClose={() => setPasswordFor(null)}
            onDone={() => {
              toast({ title: `Password changed for ${displayName(passwordFor)}`, description: 'They were signed out and must use the new password.' })
              setPasswordFor(null)
            }}
          />
        )}
      </Modal>

      <Modal
        open={!!transferTo}
        onClose={() => setTransferTo(null)}
        title={transferTo ? `Make ${displayName(transferTo)} the Super Admin` : ''}
        description="Hand over the Super Admin role. This needs a code from you and a code from them."
        size="sm"
      >
        {transferTo && (
          <AdminTransfer
            key={transferTo.id}
            staff={transferTo}
            onClose={() => setTransferTo(null)}
            onDone={({ new_admin: newAdmin }) => {
              toast({ title: `${displayName(newAdmin)} is now the Super Admin`, description: 'Your account is now a staff account. Sign in again to continue.' })
              setTransferTo(null)
              signOut()
              navigate('/login', { replace: true })
            }}
          />
        )}
      </Modal>

      <Modal
        open={!!toggling}
        onClose={() => !busy && setToggling(null)}
        size="sm"
        title={toggling?.is_active ? `Deactivate ${toggling && displayName(toggling)}?` : `Activate ${toggling && displayName(toggling)}?`}
        description={
          toggling?.is_active
            ? 'They will be signed out right away and can’t sign in until you activate them again. Their account and details stay.'
            : 'They will be able to sign in to the Staff app again.'
        }
        footer={
          <>
            <Button onClick={() => setToggling(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant={toggling?.is_active ? 'danger' : 'dark'} icon={Power} loading={busy} onClick={confirmToggle}>
              {toggling?.is_active ? 'Deactivate' : 'Activate'}
            </Button>
          </>
        }
      />

      <Modal
        open={!!deleting}
        onClose={() => !busy && setDeleting(null)}
        size="sm"
        title={`Delete ${deleting ? displayName(deleting) : ''}?`}
        description="This permanently removes their account and they are signed out right away. It can’t be undone. To only block sign-in for now, deactivate them instead."
        footer={
          <>
            <Button onClick={() => setDeleting(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" icon={Trash2} loading={busy} onClick={confirmDelete}>
              Delete
            </Button>
          </>
        }
      />
    </>
  )
}
