from uuid import uuid4

from django.utils.translation import gettext_lazy as _
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from authentication.constants import REMEMBER_ME_SESSION_LIFETIME, SHORT_SESSION_LIFETIME


class SessionRefreshToken(RefreshToken):
    """A refresh token that lasts longer when "Remember me" was ticked, and that dies on sign-out.

    The choice is kept in the token's `remember` claim, so every refresh (which issues a new refresh
    token) keeps the same lifetime. Tokens issued before this claim existed count as remembered.

    Every sign-in gets a session id (`sid` claim) that every refreshed token keeps. Signing out revokes
    the sid, so all refresh tokens of that sign-in stop working, including older copies and other tabs.
    """

    def __init__(self, token=None, verify=True):
        super().__init__(token, verify)
        # What signing out revokes. Tokens from before sids existed are revoked one by one (by jti).
        self.session_key = self.payload.get('sid') or self.payload.get('jti')
        if 'sid' not in self.payload:  # a new sign-in; an old token gets one so its next refresh is a normal session
            self.payload['sid'] = uuid4().hex

    def verify(self):
        super().verify()
        from authentication.models import RevokedSession  # here: the models package must load before tokens are used

        key = self.payload.get('sid') or self.payload.get('jti')
        if key and RevokedSession.objects.filter(key=key).exists():
            raise TokenError(_('You have signed out. Sign in again.'))

    def set_exp(self, claim='exp', from_time=None, lifetime=None):
        if lifetime is None and claim == 'exp':
            lifetime = REMEMBER_ME_SESSION_LIFETIME if self.payload.get('remember', True) else SHORT_SESSION_LIFETIME
        super().set_exp(claim=claim, from_time=from_time, lifetime=lifetime)
