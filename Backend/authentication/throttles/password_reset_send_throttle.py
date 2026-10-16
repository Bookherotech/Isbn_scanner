from rest_framework.throttling import AnonRateThrottle


class PasswordResetSendThrottle(AnonRateThrottle):
    """Per IP: limits "send me a reset code" requests (each one can send an email, and tells whether an account exists)."""

    scope = 'password_reset_send'
    rate = '5/min'
