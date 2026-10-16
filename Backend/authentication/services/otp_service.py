import hashlib
import hmac
import math
import secrets
from dataclasses import dataclass
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from authentication.constants import (
    OTP_LENGTH,
    OTP_MAX_ATTEMPTS,
    OTP_MAX_SENDS,
    OTP_RESEND_COOLDOWN_SECONDS,
    OTP_TTL_SECONDS,
)
from authentication.exceptions import (
    ChallengeExpired,
    InvalidChallenge,
    OtpDeliveryError,
    ResendCooldown,
    TooManyAttempts,
    TooManyResends,
    WrongCode,
)
from authentication.models import LoginOTP
from authentication.services.otp_email import send_otp_email


@dataclass(frozen=True)
class Challenge:
    token: str  # secret the client sends back with the code
    expires_in: int  # seconds


def generate_code():
    """A random 4-digit code from the OS secure random source (0000-9999)."""
    return f'{secrets.randbelow(10**OTP_LENGTH):0{OTP_LENGTH}d}'


def hash_challenge(token):
    return hashlib.sha256(token.encode()).hexdigest()


def hash_code(challenge_hash, code):
    """Keyed hash: a leaked table is useless without SECRET_KEY, and a code only fits its own challenge."""
    return hmac.new(settings.SECRET_KEY.encode(), f'{challenge_hash}:{code}'.encode(), hashlib.sha256).hexdigest()


def _find(token):
    # select_related: the user comes in the same query (no second lookup)
    return LoginOTP.objects.select_related('user').filter(challenge_hash=hash_challenge(token)).first()


def _usable_row(token, now):
    row = _find(token)
    if row is None or row.used_at is not None:
        raise InvalidChallenge()
    if row.expires_at <= now:
        raise ChallengeExpired()
    return row


def start_challenge(user):
    """Create a code for this user, email it, and return the token the client must send back."""
    token = secrets.token_urlsafe(32)
    code = generate_code()
    challenge_hash = hash_challenge(token)
    now = timezone.now()

    with transaction.atomic():
        LoginOTP.objects.filter(user=user).delete()  # a new sign-in cancels any earlier one
        row = LoginOTP.objects.create(
            user=user,
            challenge_hash=challenge_hash,
            code_hash=hash_code(challenge_hash, code),
            last_sent_at=now,
            expires_at=now + timedelta(seconds=OTP_TTL_SECONDS),
        )
    try:  # outside the transaction: no database transaction stays open while the mail server answers
        send_otp_email(user, code)
    except Exception as error:
        row.delete()
        raise OtpDeliveryError() from error
    return Challenge(token=token, expires_in=OTP_TTL_SECONDS)


def verify_challenge(token, code):
    """Check the code. Returns the user on success; raises an OtpError otherwise."""
    now = timezone.now()
    row = _usable_row(token, now)

    # Count the guess atomically *before* comparing, so parallel requests cannot beat the limit.
    counted = LoginOTP.objects.filter(pk=row.pk, attempts__lt=OTP_MAX_ATTEMPTS, used_at__isnull=True).update(
        attempts=F('attempts') + 1
    )
    if not counted:
        raise TooManyAttempts()

    if not hmac.compare_digest(row.code_hash, hash_code(row.challenge_hash, code)):
        raise WrongCode(attempts_left=max(OTP_MAX_ATTEMPTS - row.attempts - 1, 0))

    # Single use: only one request can flip used_at from NULL.
    if LoginOTP.objects.filter(pk=row.pk, used_at__isnull=True).update(used_at=now) != 1:
        raise InvalidChallenge()
    if not row.user.is_active:
        raise InvalidChallenge()
    return row.user


def resend_challenge(token):
    """Send a fresh code for the same sign-in (limited count and a short cool-down)."""
    now = timezone.now()
    row = _usable_row(token, now)

    if row.sends >= OTP_MAX_SENDS:
        raise TooManyResends()
    wait = row.last_sent_at + timedelta(seconds=OTP_RESEND_COOLDOWN_SECONDS) - now
    if wait.total_seconds() > 0:
        raise ResendCooldown(retry_after=math.ceil(wait.total_seconds()))

    code = generate_code()
    updated = LoginOTP.objects.filter(pk=row.pk, sends=row.sends, used_at__isnull=True).update(
        code_hash=hash_code(row.challenge_hash, code),
        attempts=0,
        sends=F('sends') + 1,
        last_sent_at=now,
        expires_at=now + timedelta(seconds=OTP_TTL_SECONDS),
    )
    if not updated:  # another resend won the race
        raise ResendCooldown(retry_after=OTP_RESEND_COOLDOWN_SECONDS)
    try:
        send_otp_email(row.user, code)
    except Exception as error:
        raise OtpDeliveryError() from error
    return Challenge(token=token, expires_in=OTP_TTL_SECONDS)
