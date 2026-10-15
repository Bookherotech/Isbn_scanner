import { useCallback, useRef, useState } from 'react'
import { Check, CloudOff, RotateCcw } from 'lucide-react'
import { cn } from '../../utils/format'
import { Button } from './Button'
import { Illustration } from './Illustrations'

export function Spinner({ size = 16, className }) {
  return <span className={cn('spinner', className)} style={{ width: size, height: size }} aria-hidden />
}

export function Skeleton({ w = '100%', h = 12, r = 4, className, style }) {
  return <span className={cn('skeleton', className)} style={{ width: w, height: h, borderRadius: r, ...style }} aria-hidden />
}

export function TableSkeleton({ rows = 8, cols = 6 }) {
  return (
    <div className="table-skeleton" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, r) => (
        <div className="table-skeleton__row" key={r}>
          <Skeleton w={28} h={40} r={2} />
          <div style={{ flex: 2, display: 'grid', gap: 6 }}>
            <Skeleton w={`${55 + ((r * 13) % 35)}%`} h={11} />
            <Skeleton w={`${30 + ((r * 7) % 25)}%`} h={9} />
          </div>
          {Array.from({ length: cols - 2 }, (_, c) => (
            <Skeleton key={c} w={`${40 + ((r + c) * 11) % 40}%`} h={10} style={{ flex: 1 }} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function EmptyState({ art = 'books', title, children, action, compact }) {
  return (
    <div className={cn('empty', compact && 'empty--compact')}>
      <Illustration name={art} />
      <h3 className="empty__title">{title}</h3>
      {children && <p className="empty__text">{children}</p>}
      {action && <div className="empty__action">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, title, onRetry, compact }) {
  const network = error?.code === 'network'
  return (
    <div className={cn('error-state', compact && 'error-state--compact')} role="alert">
      <span className="error-state__icon">
        <CloudOff size={22} aria-hidden />
      </span>
      <div>
        <h3>{title || (network ? 'Unable to load data' : 'Something went wrong')}</h3>
        <p>{error?.message || 'The request failed.'}</p>
        <p className="error-state__hint">
          {network ? 'Check the connection (or turn off “Simulate network failure” in Demo controls), then retry.' : 'Retry. If it keeps happening, reload the page.'}
        </p>
      </div>
      {onRetry && (
        <Button icon={RotateCcw} onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  )
}

/**
 * Simulated multi-step operations ("Creating Shopify product…").
 * run(labels, task) shows each label ~300ms while the task resolves in parallel.
 */
export function useStages() {
  const [state, setState] = useState({ labels: [], current: -1, done: false, error: null })
  const running = useRef(false)

  const run = useCallback(async (labels, task, { stepMs = 320 } = {}) => {
    if (running.current) return
    running.current = true
    setState({ labels, current: 0, done: false, error: null })
    const taskP = Promise.resolve().then(task)
    try {
      for (let i = 0; i < labels.length; i++) {
        setState((s) => ({ ...s, current: i }))
        // Last step waits for the real task; earlier steps are paced for readability.
        if (i < labels.length - 1) await new Promise((r) => setTimeout(r, stepMs))
        else await taskP
      }
      const result = await taskP
      setState((s) => ({ ...s, current: labels.length, done: true }))
      return result
    } catch (error) {
      setState((s) => ({ ...s, error }))
      throw error
    } finally {
      running.current = false
    }
  }, [])

  const reset = useCallback(() => setState({ labels: [], current: -1, done: false, error: null }), [])
  return { ...state, active: state.current >= 0 && !state.done && !state.error, run, reset }
}

export function StageList({ labels, current, done, error, className }) {
  return (
    <ol className={cn('stages', className)} aria-live="polite">
      {labels.map((l, i) => {
        const state = error && i === current ? 'error' : done || i < current ? 'done' : i === current ? 'active' : 'todo'
        return (
          <li key={l} className={`stages__item is-${state}`}>
            <span className="stages__mark" aria-hidden>
              {state === 'done' ? <Check size={12} strokeWidth={3} /> : state === 'active' ? <Spinner size={12} /> : null}
            </span>
            {l}
          </li>
        )
      })}
    </ol>
  )
}
