from django.db import models


class RevokedSession(models.Model):
    """A signed-out sign-in: its refresh tokens are refused until they would have expired anyway.

    Rows past `expires_at` are useless (the tokens are expired) and are deleted on the next sign-out,
    so the table needs no clean-up job.
    """

    key = models.CharField(max_length=64, unique=True)  # the token's `sid` claim (`jti` for tokens issued before sid existed)
    expires_at = models.DateTimeField(db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'auth_revoked_sessions'

    def __str__(self):
        return f'Revoked session {self.key}'
