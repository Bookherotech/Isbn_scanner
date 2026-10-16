from pathlib import Path

from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils import timezone

from authentication.constants import OTP_TTL_SECONDS

LOGO_PATH = Path(__file__).resolve().parent.parent / 'assets' / 'email' / 'bookhero-logo.png'
LOGO_CID = 'bookhero-logo'
SUBJECT = 'Your BookHero verification code'


def mask_email(email):
    """rachel@bookhero.com -> r*****@bookhero.com"""
    name, _, domain = email.partition('@')
    return f'{name[:1]}{"*" * max(len(name) - 1, 3)}@{domain}'


class OtpEmailMessage(EmailMultiAlternatives):
    """Text + HTML email whose HTML carries the BookHero logo as an inline (cid:) image.

    The image goes inside the HTML part (multipart/related), which is what Gmail, Outlook and
    Apple Mail expect, so the logo shows without "load images" and is not listed as an attachment.
    """

    def message(self, *args, **kwargs):
        msg = super().message(*args, **kwargs)
        html_part = msg.get_body(preferencelist=('html',))
        html_part.add_related(
            LOGO_PATH.read_bytes(),
            'image',
            'png',
            cid=f'<{LOGO_CID}>',
            disposition='inline',
            filename='bookhero-logo.png',
        )
        return msg


def send_otp_email(user, code):
    """Email the code to the user in the BookHero-themed template (HTML + plain text)."""
    context = {
        'name': user.full_name or user.email,
        'code': code,
        'digits': list(code),
        'ttl_minutes': OTP_TTL_SECONDS // 60,
        'year': timezone.now().year,
        'logo_cid': LOGO_CID,
    }
    message = OtpEmailMessage(
        subject=SUBJECT,
        body=render_to_string('authentication/emails/otp_email.txt', context),
        to=[user.email],
    )
    message.attach_alternative(render_to_string('authentication/emails/otp_email.html', context), 'text/html')
    message.send(fail_silently=False)
