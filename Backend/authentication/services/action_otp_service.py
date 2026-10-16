import hmac
import math
import secrets
from datetime import timedelta

from django.db import transaction
from django.db.models import F
from django.utils import timezone

from authentication.constants import OTP_MAX_ATTEMPTS, OTP_RESEND_COOLDOWN_SECONDS, OTP_TTL_SECONDS
from authentication.exceptions import (
    ChallengeExpired,
    InvalidChallenge,
    OtpDeliveryError,
    ResendCooldown,
    TooManyAttempts,
    WrongCode,
)
from authentication.models import ActionOTP
from authentication.services.action_otp_email import send_action_otp_email
from authentication.services.otp_service import Challenge, generate_code, hash_challenge, hash_code


def start_action_code(purpose, actor, subject, to_email, name, new_email=''):
    """Create a code for `purpose`, email it to `to_email`, and return the token the client sends back.

    A new start replaces the previous code for the same (purpose, actor, subject), but not more often
    than once per cool-down, so the endpoint cannot be used to flood an inbox.
    """
    now = timezone.now()
    previous = ActionOTP.objects.filter(purpose=purpose, actor=actor, subject=subject).first()
    if previous is not None:
        wait = previous.last_sent_at + timedelta(seconds=OTP_RESEND_COOLDOWN_SECONDS) - now
        if wait.total_seconds() > 0:
            raise ResendCooldown(retry_after=math.ceil(wait.total_seconds()))

    token = secrets.token_urlsafe(32)
    code = generate_code()
    challenge_hash = hash_challenge(token)
    with transaction.atomic():
        ActionOTP.objects.filter(purpose=purpose, actor=actor, subject=subject).delete()
        row = ActionOTP.objects.create(
            purpose=purpose,
            actor=actor,
            subject=subject,
            new_email=new_email,
            challenge_hash=challenge_hash,
            code_hash=hash_code(challenge_hash, code),
            last_sent_at=now,
            expires_at=now + timedelta(seconds=OTP_TTL_SECONDS),
        )
    try:  # outside the transaction: no database transaction stays open while the mail server answers
        send_action_otp_email(purpose, to_email, name, code, staff_name=subject.full_name or subject.email, new_email=new_email)
    except Exception as error:
        row.delete()
        raise OtpDeliveryError() from error
    return Challenge(token=token, expires_in=OTP_TTL_SECONDS)


def _consume(row, code):
    """Check the code against this row and use it up. Raises an OtpError unless it is right."""
    now = timezone.now()
    if row is None or row.used_at is not None:
        raise InvalidChallenge()
    if row.expires_at <= now:
        raise ChallengeExpired()

    # Count the guess atomically *before* comparing, so parallel requests cannot beat the limit.
    counted = ActionOTP.objects.filter(pk=row.pk, attempts__lt=OTP_MAX_ATTEMPTS, used_at__isnull=True).update(attempts=F('attempts') + 1)
    if not counted:
        raise TooManyAttempts()
    if not hmac.compare_digest(row.code_hash, hash_code(row.challenge_hash, code)):
        raise WrongCode(attempts_left=max(OTP_MAX_ATTEMPTS - row.attempts - 1, 0))

    # Single use: only one request can flip used_at from NULL.
    if ActionOTP.objects.filter(pk=row.pk, used_at__isnull=True).update(used_at=now) != 1:
        raise InvalidChallenge()
    return row


def verify_action_code(purpose, actor, subject, token, code):
    """Check the code. Returns the (now used) ActionOTP row on success; raises an OtpError otherwise.

    The challenge only works for the same purpose, admin and staff member it was created for.
    """
    row = ActionOTP.objects.filter(challenge_hash=hash_challenge(token), purpose=purpose, actor=actor, subject=subject).first()
    return _consume(row, code)


def verify_password_reset_code(token, code):
    """"Forgot password": the person is not signed in, so the user comes from the challenge itself."""
    row = (
        ActionOTP.objects.select_related('actor')
        .filter(challenge_hash=hash_challenge(token), purpose=ActionOTP.Purpose.PASSWORD_RESET)
        .first()
    )
    return _consume(row, code)
