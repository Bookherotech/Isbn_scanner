from django.template.loader import render_to_string
from django.utils import timezone

from authentication.constants import OTP_TTL_SECONDS
from authentication.models import ActionOTP
from authentication.services.otp_email import LOGO_CID, OtpEmailMessage

# What each email says. Purpose -> (subject, badge, heading, intro, warning)
COPY = {
    ActionOTP.Purpose.EMAIL_CHANGE: {
        'subject': 'Confirm the email change - BookHero',
        'badge': 'Confirm email change',
        'heading': 'Approve this change',
        'intro': 'enter this code to approve changing {staff}\'s sign-in email to {new_email}.',
        'warning': 'Did not start this? Someone may be using your admin session. Sign out, change your password and tell your team.',
    },
    ActionOTP.Purpose.PASSWORD_RESET: {
        'subject': 'Reset your password - BookHero',
        'badge': 'Reset password',
        'heading': 'Your password reset code',
        'intro': 'enter this code to reset your BookHero password.',
        'warning': 'Did not ask for this? Ignore this email and your password stays the same.',
    },
    ActionOTP.Purpose.EMAIL_VERIFY: {
        'subject': 'Confirm your email - BookHero',
        'badge': 'Confirm your email',
        'heading': 'Confirm this email address',
        'intro': 'your BookHero admin changed your sign-in email to this address. Give this code to your admin to confirm it is yours.',
        'warning': 'Did not expect this? Ignore this email and tell your admin. Nothing changes until the code is entered.',
    },
}


def send_action_otp_email(purpose, to_email, name, code, staff_name='', new_email=''):
    """Email a confirmation code in the BookHero-themed template (HTML + plain text)."""
    copy = COPY[purpose]
    context = {
        'name': name,
        'code': code,
        'digits': list(code),
        'ttl_minutes': OTP_TTL_SECONDS // 60,
        'year': timezone.now().year,
        'logo_cid': LOGO_CID,
        'badge': copy['badge'],
        'heading': copy['heading'],
        'intro': copy['intro'].format(staff=staff_name or 'a staff member', new_email=new_email),
        'warning': copy['warning'],
    }
    message = OtpEmailMessage(
        subject=copy['subject'],
        body=render_to_string('authentication/emails/action_otp_email.txt', context),
        to=[to_email],
    )
    message.attach_alternative(render_to_string('authentication/emails/action_otp_email.html', context), 'text/html')
    message.send(fail_silently=False)
