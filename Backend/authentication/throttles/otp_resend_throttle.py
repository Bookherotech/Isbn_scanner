from rest_framework.throttling import AnonRateThrottle


class OtpResendThrottle(AnonRateThrottle):
    """Per-IP limit on "send me another code" requests."""

    scope = 'otp_resend'
    rate = '5/min'
