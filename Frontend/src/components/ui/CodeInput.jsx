import { useRef, useState } from 'react'
import { cn } from '../../utils/format'

/**
 * A row of one-digit boxes for a verification code. Typing moves to the next box, pasting spreads the
 * digits, and `onComplete(code)` fires when every box is filled. To clear it after a wrong code, give
 * it a new `key` (it also puts the cursor back on the first box).
 */
export function CodeInput({ length = 4, onComplete, disabled, hasError, compact, label = 'Verification code' }) {
  const [digits, setDigits] = useState(() => Array(length).fill(''))
  const boxes = useRef([])
  const focusBox = (index) => boxes.current[index]?.focus()

  const change = (index, value) => {
    const entered = value.replace(/\D/g, '')
    const next = [...digits]
    if (!entered) {
      next[index] = ''
      setDigits(next)
      return
    }
    entered
      .slice(0, length - index)
      .split('')
      .forEach((digit, offset) => {
        next[index + offset] = digit
      })
    setDigits(next)
    focusBox(Math.min(index + entered.length, length - 1))
    if (next.every(Boolean)) onComplete?.(next.join(''))
  }

  const keyDown = (index, e) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) focusBox(index - 1)
    if (e.key === 'ArrowLeft' && index > 0) focusBox(index - 1)
    if (e.key === 'ArrowRight' && index < length - 1) focusBox(index + 1)
  }

  return (
    <div className={cn('otp', compact && 'otp--compact', hasError && 'has-error')} role="group" aria-label={label}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            boxes.current[index] = el
          }}
          className={cn('otp__box', digit && 'is-filled')}
          value={digit}
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit ${index + 1} of ${length}`}
          autoFocus={index === 0}
          disabled={disabled}
          onChange={(e) => change(index, e.target.value)}
          onKeyDown={(e) => keyDown(index, e)}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  )
}
