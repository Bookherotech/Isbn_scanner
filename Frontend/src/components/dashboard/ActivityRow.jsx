import { Bot, Store } from 'lucide-react'
import { Avatar } from '../ui/Misc'
import { db } from '../../services/store'
import { cn, formatDateTime, timeAgo } from '../../utils/format'

export function ActorAvatar({ actor, name, size = 28 }) {
  if (actor === 'system')
    return (
      <span className="actor actor--system" style={{ width: size, height: size }} title="System">
        <Bot size={size * 0.55} aria-hidden />
      </span>
    )
  if (actor === 'shopify')
    return (
      <span className="actor actor--shopify" style={{ width: size, height: size }} title="Shopify (mock)">
        <Store size={size * 0.52} aria-hidden />
      </span>
    )
  const hue = db().users.find((u) => u.id === actor)?.hue ?? 40
  return <Avatar name={name} hue={hue} size={size} />
}

export function ActivityRow({ a, compact }) {
  return (
    <li className={cn('act', compact && 'act--compact', `act--${a.result}`)}>
      <ActorAvatar actor={a.actor} name={a.actorName} size={compact ? 26 : 30} />
      <div className="act__main">
        <p className="act__line">
          <strong>{a.actorName === 'Rachel Morgan' ? 'Admin' : a.actorName.split(' ')[0]}</strong> <span className="act__verb">{a.action.toLowerCase()}</span> <span className="act__obj">{a.object}</span>
        </p>
        {a.detail && <p className="act__detail">{a.detail}</p>}
      </div>
      <time className="act__time" dateTime={new Date(a.at).toISOString()} title={formatDateTime(a.at)}>
        {timeAgo(a.at)}
      </time>
    </li>
  )
}
