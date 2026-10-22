/**
 * "Remember me" on the sign-in form: the last email and the checkbox choice, so the form is
 * pre-filled next time. Only the email is kept, never the password.
 */
const KEY = 'bookhero.rememberedLogin'

export function readRememberedLogin() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (saved) return { email: saved.email || '', remember: saved.remember !== false }
  } catch {
    /* blocked or corrupt: fall back to the defaults */
  }
  return { email: '', remember: true }
}

/** Ticked: keep the email for next time. Not ticked: forget it (only the choice is kept). */
export function saveRememberedLogin({ email, remember }) {
  try {
    localStorage.setItem(KEY, JSON.stringify(remember ? { email: email.trim().toLowerCase(), remember: true } : { remember: false }))
  } catch {
    /* storage blocked: nothing is remembered */
  }
}
