from .otp_errors import OtpError


class TransferNotApproved(OtpError):
    default_detail = 'Approve the transfer with the code sent to your email first. Start again.'
    default_code = 'transfer_not_approved'


class TransferNotAllowed(OtpError):
    default_detail = 'Only an active staff account can become the Super Admin.'
    default_code = 'transfer_not_allowed'
