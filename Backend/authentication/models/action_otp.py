from django.conf import settings
from django.db import models
from django.utils import timezone


class ActionOTP(models.Model):
    """A 4-digit code that confirms one sensitive admin action. Only a keyed hash of the code is stored.

    Two purposes, both started by an admin (`actor`) about a staff member (`subject`):
      EMAIL_CHANGE  the code goes to the ADMIN's inbox and approves changing the staff member's email to `new_email`
      EMAIL_VERIFY  the code goes to the STAFF member's (new) inbox and proves that address is real

    There is at most one row per (purpose, actor, subject): starting again replaces it, so the table
    stays small and needs no clean-up job.
    """

    class Purpose(models.TextChoices):
        EMAIL_CHANGE = 'email_change', 'Approve email change'
        EMAIL_VERIFY = 'email_verify', 'Verify email'
        PASSWORD_RESET = 'password_reset', 'Reset password'  # "forgot password": the code goes to the user's own inbox

    purpose = models.CharField(max_length=20, choices=Purpose.choices)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='+')
    subject = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='+')
    new_email = models.EmailField(max_length=254, blank=True, default='')  # only for EMAIL_CHANGE
    challenge_hash = models.CharField(max_length=64, unique=True)  # sha256 of the token the client holds
    code_hash = models.CharField(max_length=64)  # HMAC(SECRET_KEY, challenge + code)
    attempts = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    last_sent_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'auth_action_otps'
        constraints = [
            models.UniqueConstraint(fields=['purpose', 'actor', 'subject'], name='action_otp_one_per_purpose'),
        ]

    def __str__(self):
        return f'{self.purpose} for user {self.subject_id}'
