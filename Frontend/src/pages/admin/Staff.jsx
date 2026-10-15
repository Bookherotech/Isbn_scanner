import { useMemo, useState } from 'react'
import { Pencil, Power, UserPlus } from 'lucide-react'
import { getStaff, saveStaff, setStaffStatus } from '../../services/mockApi'
import { useDebounce, useQuery, useTicker } from '../../hooks/useStore'
import { useToast } from '../../hooks/useToast'
import { DataTable } from '../../components/ui/Data'
import { Avatar, PageHeader } from '../../components/ui/Misc'
import { Field, Input, SearchInput, Segmented } from '../../components/ui/Form'
import { Button, IconButton } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/Feedback'
import { Modal } from '../../components/ui/Overlay'
import { cn, timeAgo } from '../../utils/format'

export default function Staff() {
  const { toast } = useToast()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const dq = useDebounce(q, 150)
  const { data, loading, error, reload, refreshing } = useQuery(() => getStaff(), [])
  const [editing, setEditing] = useState(null)
  const [toggling, setToggling] = useState(null)
  useTicker()

  const rows = useMemo(
    () =>
      (data || []).filter(
        (u) => (filter === 'all' || u.status === filter) && (!dq || `${u.name} ${u.username} ${u.email}`.toLowerCase().includes(dq.toLowerCase())),
      ),
    [data, dq, filter],
  )

  const columns = [
    {
      key: 'name',
      header: 'Name',
      card: 'title',
      render: (u) => (
        <span className="person person--lg">
          <Avatar name={u.name} hue={u.hue} size={32} />
          <span>
            <strong>{u.name}</strong>
            <span className="muted">{u.email}</span>
          </span>
        </span>
      ),
    },
    { key: 'username', header: 'Username', card: 'meta', render: (u) => <span className="td-mono">@{u.username}</span> },
    { key: 'status', header: 'Status', card: 'badge', render: (u) => <span className={cn('state-pill', u.status === 'active' ? 'is-on' : 'is-off')}>{u.status === 'active' ? 'Active' : 'Inactive'}</span> },
    { key: 'submitted', header: 'Books submitted', align: 'right', card: 'meta', render: (u) => <span className="num td-strong">{u.submitted}</span> },
    {
      key: 'quality',
      header: 'Approved / rejected',
      card: 'meta',
      render: (u) => (
        <span className="ratio" title={`${u.approved} approved, ${u.rejected} rejected`}>
          <span className="ratio__bar" aria-hidden>
            <span style={{ width: `${u.submitted ? (u.approved / u.submitted) * 100 : 0}%` }} />
            <span className="is-rej" style={{ width: `${u.submitted ? (u.rejected / u.submitted) * 100 : 0}%` }} />
          </span>
          <span className="num">
            {u.approved} / {u.rejected}
          </span>
        </span>
      ),
    },
    { key: 'last', header: 'Last active', card: 'meta', render: (u) => <span className="td-muted">{u.lastActive ? timeAgo(u.lastActive) : 'Never'}</span> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      card: 'action',
      render: (u) => (
        <span className="row-actions">
          <IconButton icon={Pencil} label={`Edit ${u.name}`} size={15} onClick={() => setEditing(u)} />
          <IconButton icon={Power} label={u.status === 'active' ? `Deactivate ${u.name}` : `Activate ${u.name}`} size={15} onClick={() => setToggling(u)} />
        </span>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Staff"
        eyebrow="Management"
        description="People who scan and submit books from the Staff app. Deactivated staff can’t sign in."
        actions={
          <Button variant="primary" icon={UserPlus} onClick={() => setEditing({})}>
            Add staff
          </Button>
        }
      />
      <div className="toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="Search name, username or email" />
        <Segmented
          label="Status"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All', count: data?.length },
            { value: 'active', label: 'Active', count: data?.filter((u) => u.status === 'active').length },
            { value: 'inactive', label: 'Inactive', count: data?.filter((u) => u.status === 'inactive').length },
          ]}
        />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        error={error}
        onRetry={reload}
        refreshing={refreshing}
        caption="Staff"
        empty={<EmptyState art="search" title="No staff found">No one matches “{dq}”.</EmptyState>}
      />

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? `Edit ${editing.name}` : 'Add staff member'} description={editing?.id ? undefined : 'They’ll receive an invitation to set a password (simulated).'} size="sm">
        {editing && (
          <StaffForm
            key={editing.id || 'new'}
            user={editing}
            onClose={() => setEditing(null)}
            onSaved={(name, isNew) => toast({ title: isNew ? `${name} added` : 'Staff updated', description: isNew ? 'Invitation sent (simulated).' : undefined })}
          />
        )}
      </Modal>
      <Modal
        open={!!toggling}
        onClose={() => setToggling(null)}
        size="sm"
        title={toggling?.status === 'active' ? `Deactivate ${toggling?.name}?` : `Activate ${toggling?.name}?`}
        description={toggling?.status === 'active' ? 'They will be signed out and can’t use the Staff app. Their submissions stay in BookHero.' : 'They can sign in to the Staff app again.'}
        footer={
          <>
            <Button onClick={() => setToggling(null)}>Cancel</Button>
            <Button
              variant={toggling?.status === 'active' ? 'danger' : 'dark'}
              icon={Power}
              onClick={async () => {
                const u = toggling
                await setStaffStatus(u.id, u.status === 'active' ? 'inactive' : 'active')
                setToggling(null)
                toast({ title: `${u.name} ${u.status === 'active' ? 'deactivated' : 'activated'}`, tone: 'info' })
              }}
            >
              {toggling?.status === 'active' ? 'Deactivate' : 'Activate'}
            </Button>
          </>
        }
      />
    </div>
  )
}

function StaffForm({ user, onClose, onSaved }) {
  const [name, setName] = useState(user.name || '')
  const [username, setUsername] = useState(user.username || '')
  const [email, setEmail] = useState(user.email || '')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      await saveStaff({ id: user.id, name, username, email })
      onSaved(name, !user.id)
      onClose()
    } catch (x) {
      setErr(x.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="form-stack">
      <Field label="Full name" htmlFor="s-name">
        <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Priya Shah" data-autofocus />
      </Field>
      <Field label="Username" htmlFor="s-user" error={err}>
        <Input id="s-user" mono value={username} onChange={(e) => setUsername(e.target.value.replace(/\s/g, '.').toLowerCase())} placeholder="priya.shah" />
      </Field>
      <Field label="Email" htmlFor="s-mail" optional>
        <Input id="s-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="priya@bookhero.store" />
      </Field>
      <p className="field__hint">Role: Staff — can scan, correct metadata, choose shelf and quantity, and submit for approval.</p>
      <div className="form-actions">
        <span style={{ flex: 1 }} />
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="dark" loading={busy}>
          {user.id ? 'Save' : 'Add staff'}
        </Button>
      </div>
    </form>
  )
}
