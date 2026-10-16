from django.conf import settings
from django.db import models
from django.utils import timezone


class LoginOTP(models.Model):
    """One pending Super Admin sign-in: the 4-digit code is stored only as a keyed hash.

    A user has at most one row. Starting a new sign-in deletes the old one, so the table
    never grows beyond one row per Super Admin and needs no clean-up job.
    """

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='login_otps')  # FK => indexed
    challenge_hash = models.CharField(max_length=64, unique=True)  # sha256 of the token the client holds
    code_hash = models.CharField(max_length=64)  # HMAC(SECRET_KEY, challenge + code)
    attempts = models.PositiveSmallIntegerField(default=0)
    sends = models.PositiveSmallIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    last_sent_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'auth_login_otps'

    def __str__(self):
        return f'OTP for user {self.user_id}'
