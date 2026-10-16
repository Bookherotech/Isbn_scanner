from rest_framework.throttling import AnonRateThrottle


class OtpVerifyThrottle(AnonRateThrottle):
    """Per-IP limit on code checks. The per-code attempt limit (5) is the real guard; this slows floods."""

    scope = 'otp_verify'
    rate = '10/min'
