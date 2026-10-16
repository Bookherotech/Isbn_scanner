"""Rules for the Super Admin sign-in code (OTP)."""

OTP_LENGTH = 4  # digits
OTP_TTL_SECONDS = 5 * 60  # a code works for 5 minutes
OTP_MAX_ATTEMPTS = 5  # wrong guesses allowed per code, then the sign-in must be started again
OTP_MAX_SENDS = 3  # the first email plus two resends per sign-in
OTP_RESEND_COOLDOWN_SECONDS = 30  # wait between resends
