from rest_framework.throttling import AnonRateThrottle


class PasswordResetCheckThrottle(AnonRateThrottle):
    """Per IP: limits code checks and password changes. The per-code attempt limit (5) is the real guard."""

    scope = 'password_reset_check'
    rate = '10/min'
