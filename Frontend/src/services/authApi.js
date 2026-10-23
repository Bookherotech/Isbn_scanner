import { HttpError, request } from './apiClient'

const NETWORK_DOWN = 'Cannot reach the server. Check your connection and try again.'

function loginError(error) {
  if (!(error instanceof HttpError)) return error
  if (error.data?.code?.startsWith('otp_')) return error // e.g. the code email could not be sent: the backend message is clear
  if (error.data?.code === 'account_inactive') return error // "Your account has been deactivated. Contact your admin."
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
export async function loginWithPassword({ email, password, remember = false }) {
  try {
    return await request('/api/auth/login/', { method: 'POST', body: { email: email.trim().toLowerCase(), password, remember }, auth: false })
  } catch (error) {
    throw loginError(error)
  }
}

/** POST /api/auth/login/verify-otp/ -> { access, refresh, user }. `remember` = "Remember me" (30-day sign-in). */
export async function verifyOtp({ challenge, otp, remember = false }) {
  try {
    return await request('/api/auth/login/verify-otp/', { method: 'POST', body: { challenge, otp, remember }, auth: false })
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

/**
 * GET /api/auth/users/?role=staff -> { results: [user], next } (Admin only).
 * Pass the `next` link from the previous page to get the following page.
 */
export function fetchStaff(next) {
  if (!next) return request('/api/auth/users/?role=staff&page_size=100')
  const link = new URL(next)
  return request(link.pathname + link.search)
}

/**
 * POST /api/auth/staff/ (Admin only) -> the new user.
 * A 400 error carries the field messages in `error.data`, e.g. { email: ['...'], password: ['...'] }.
 */
export function createStaff({ fullName, phoneNumber, email, password, confirmPassword }) {
  return request('/api/auth/staff/', {
    method: 'POST',
    body: { full_name: fullName, phone_number: phoneNumber, email, password, confirm_password: confirmPassword },
  })
}

/**
 * PATCH /api/auth/staff/<id>/ (Admin only) -> the updated user. Send only what changed:
 * fullName, phoneNumber, email, isActive (true / false activates or deactivates the account).
 */
export function updateStaff(id, { fullName, phoneNumber, email, isActive }) {
  const body = {}
  if (fullName !== undefined) body.full_name = fullName
  if (phoneNumber !== undefined) body.phone_number = phoneNumber
  if (email !== undefined) body.email = email
  if (isActive !== undefined) body.is_active = isActive
  return request(`/api/auth/staff/${id}/`, { method: 'PATCH', body })
}

/** DELETE /api/auth/staff/<id>/ (Admin only): removes the account for good. */
export function deleteStaff(id) {
  return request(`/api/auth/staff/${id}/`, { method: 'DELETE' })
}

/**
 * "Forgot password" (nobody is signed in):
 *  1. requestPasswordReset  -> a code is emailed to the account: { challenge, email_hint, expires_in }
 *                              no account -> 404 { code: 'no_account' }; deactivated -> 403 { code: 'account_inactive' }
 *  2. verifyPasswordResetCode -> a right code returns a short-lived ticket: { reset_token }
 *  3. confirmPasswordReset  -> the ticket + the new password change it
 * Errors carry { detail, code, attempts_left?, retry_after? } (or field messages) in `error.data`.
 */
export function requestPasswordReset(email) {
  return request('/api/auth/password-reset/', { method: 'POST', body: { email: email.trim().toLowerCase() }, auth: false })
}

export function verifyPasswordResetCode({ challenge, otp }) {
  return request('/api/auth/password-reset/verify/', { method: 'POST', body: { challenge, otp }, auth: false })
}

export function confirmPasswordReset({ resetToken, password, confirmPassword }) {
  return request('/api/auth/password-reset/confirm/', {
    method: 'POST',
    body: { reset_token: resetToken, password, confirm_password: confirmPassword },
    auth: false,
  })
}

/**
 * Changing a staff member's email takes two codes (Admin only):
 *  1. startEmailChange      -> a code is sent to the ADMIN's own inbox: { challenge, email_hint, new_email, expires_in }
 *  2. confirmEmailChange    -> the right code changes the email and sends a second code to the NEW address:
 *                              { user, verification: { challenge, email_hint, expires_in } | null }
 *  3. confirmEmailVerification -> the second code proves the new address is real: the user (email_verified: true)
 * sendEmailVerification (re)sends the second code for an address that is still unverified.
 * Errors carry { detail, code, attempts_left?, retry_after? } in `error.data`.
 */
export function startEmailChange(id, newEmail) {
  return request(`/api/auth/staff/${id}/email-change/`, { method: 'POST', body: { new_email: newEmail } })
}

export function confirmEmailChange(id, { challenge, otp }) {
  return request(`/api/auth/staff/${id}/email-change/confirm/`, { method: 'POST', body: { challenge, otp } })
}

export function sendEmailVerification(id) {
  return request(`/api/auth/staff/${id}/email-verification/`, { method: 'POST', body: {} })
}

export function confirmEmailVerification(id, { challenge, otp }) {
  return request(`/api/auth/staff/${id}/email-verification/confirm/`, { method: 'POST', body: { challenge, otp } })
}

/**
 * Make a staff member the Super Admin (Admin only). Two codes:
 *  1. startAdminTransfer      -> a code to YOUR inbox: { challenge, email_hint, expires_in }
 *  2. approveAdminTransfer    -> your code approves; a second code goes to THEIR inbox: { challenge, email_hint, expires_in }
 *     resendAdminTransferCode -> sends their code again (after approval)
 *  3. completeAdminTransfer   -> their code completes it: { new_admin, you } (you are now staff)
 */
export function startAdminTransfer(id) {
  return request(`/api/auth/staff/${id}/admin-transfer/`, { method: 'POST', body: {} })
}

export function approveAdminTransfer(id, { challenge, otp }) {
  return request(`/api/auth/staff/${id}/admin-transfer/approve/`, { method: 'POST', body: { challenge, otp } })
}

export function resendAdminTransferCode(id) {
  return request(`/api/auth/staff/${id}/admin-transfer/resend/`, { method: 'POST', body: {} })
}

export function completeAdminTransfer(id, { challenge, otp }) {
  return request(`/api/auth/staff/${id}/admin-transfer/complete/`, { method: 'POST', body: { challenge, otp } })
}

/** POST /api/auth/staff/<id>/password/ (Admin only): sets a new password and signs the staff member out. */
export function changeStaffPassword(id, { password, confirmPassword }) {
  return request(`/api/auth/staff/${id}/password/`, { method: 'POST', body: { password, confirm_password: confirmPassword } })
}

/**
 * PATCH /api/auth/me/ -> the updated user. Only name and phone can change; the email never can.
 * A 400 error carries the field messages in `error.data`.
 */
export function saveProfile({ fullName, phoneNumber }) {
  const body = {}
  if (fullName !== undefined) body.full_name = fullName
  if (phoneNumber !== undefined) body.phone_number = phoneNumber
  return request('/api/auth/me/', { method: 'PATCH', body })
}

/**
 * POST /api/auth/me/password/ -> { access, refresh, user }: the signed-in user changes their own password.
 * Other sessions stop working; the new tokens keep this one signed in. Field errors come back in `error.data`.
 */
export function changeOwnPassword({ currentPassword, password, confirmPassword }) {
  return request('/api/auth/me/password/', {
    method: 'POST',
    body: { current_password: currentPassword, password, confirm_password: confirmPassword },
  })
}

/** GET /api/auth/me/ -> the signed-in user (refreshes the access token when it has expired) */
export function fetchMe() {
  return request('/api/auth/me/')
}
