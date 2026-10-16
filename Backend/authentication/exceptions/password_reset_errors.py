from rest_framework import status

from .otp_errors import OtpError


class NoAccountFound(OtpError):
    status_code = status.HTTP_404_NOT_FOUND
    default_detail = 'No account found with this email.'
    default_code = 'no_account'


class AccountInactive(OtpError):
    status_code = status.HTTP_403_FORBIDDEN
    default_detail = 'This account is deactivated. Contact your admin.'
    default_code = 'account_inactive'


class InvalidResetToken(OtpError):
    default_detail = 'This reset link has expired. Start again.'
    default_code = 'reset_token_invalid'
