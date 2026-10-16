from rest_framework import status
from rest_framework.exceptions import APIException


class OtpError(APIException):
    """Base for OTP problems. The response body is {detail, code, ...extra}."""

    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = 'Could not verify the code.'
    default_code = 'otp_error'

    def __init__(self, detail=None, **extra):
        super().__init__(detail=detail or self.default_detail)
        # Plain dict on purpose: DRF would turn extra values such as attempts_left=4 into the string "4".
        self.detail = {'detail': str(self.detail), 'code': self.default_code, **extra}


class InvalidChallenge(OtpError):
    default_detail = 'This sign-in request is not valid. Please sign in again.'
    default_code = 'otp_invalid_challenge'


class ChallengeExpired(OtpError):
    default_detail = 'The code has expired. Please sign in again.'
    default_code = 'otp_expired'


class WrongCode(OtpError):
    default_detail = 'That code is not correct.'
    default_code = 'otp_incorrect'


class TooManyAttempts(OtpError):
    default_detail = 'Too many incorrect codes. Please sign in again.'
    default_code = 'otp_locked'


class ResendCooldown(OtpError):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    default_detail = 'Please wait a moment before asking for another code.'
    default_code = 'otp_resend_cooldown'


class TooManyResends(OtpError):
    default_detail = 'No more codes can be sent for this sign-in. Please sign in again.'
    default_code = 'otp_resend_limit'


class OtpDeliveryError(OtpError):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = 'We could not send the verification email. Please try again.'
    default_code = 'otp_delivery_failed'
