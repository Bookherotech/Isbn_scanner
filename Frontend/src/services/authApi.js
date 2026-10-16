import { HttpError, request } from './apiClient'

const NETWORK_DOWN = 'Cannot reach the server. Check your connection and try again.'

function loginError(error) {
  if (!(error instanceof HttpError)) return error
  if (error.data?.code?.startsWith('otp_')) return error // e.g. the code email could not be sent: the backend message is clear
  const messages = {
    0: NETWORK_DOWN,
    400: 'Enter your email and password.',
    401: 'Incorrect email or password.',
    429: 'Too many sign-in attempts. Please wait a minute and try again.',
  }
  return new HttpError(error.status, messages[error.status] || 'Something went wrong. Please try again.', error.data)
}

// OTP errors carry {detail, code, attempts_left?, retry_after?} from the backend; its messages are user-friendly.
function otpError(error) {
  if (!(error instanceof HttpError)) return error
  if (error.status === 0) return new HttpError(0, NETWORK_DOWN)
  if (error.status === 429 && !error.data?.code) return new HttpError(429, 'Too many attempts. Please wait a minute and try again.', error.data)
  return error
}

/**
 * POST /api/auth/login/
 * Staff:       { access, refresh, user }
 * Super Admin: { otp_required: true, challenge, email_hint, expires_in } - a code was emailed
 */
export async function loginWithPassword({ email, password }) {
  try {
    return await request('/api/auth/login/', { method: 'POST', body: { email: email.trim().toLowerCase(), password }, auth: false })
  } catch (error) {
    throw loginError(error)
  }
}

/** POST /api/auth/login/verify-otp/ -> { access, refresh, user } */
export async function verifyOtp({ challenge, otp }) {
  try {
    return await request('/api/auth/login/verify-otp/', { method: 'POST', body: { challenge, otp }, auth: false })
  } catch (error) {
    throw otpError(error)
  }
}

/** POST /api/auth/login/resend-otp/ -> { expires_in } */
export async function resendOtp({ challenge }) {
  try {
    return await request('/api/auth/login/resend-otp/', { method: 'POST', body: { challenge }, auth: false })
  } catch (error) {
    throw otpError(error)
  }
}

/** GET /api/auth/me/ -> the signed-in user (refreshes the access token when it has expired) */
export function fetchMe() {
  return request('/api/auth/me/')
}
