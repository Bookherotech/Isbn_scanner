from rest_framework_simplejwt.tokens import RefreshToken

from authentication.constants import REMEMBER_ME_SESSION_LIFETIME, SHORT_SESSION_LIFETIME


class SessionRefreshToken(RefreshToken):
    """A refresh token that lasts longer when "Remember me" was ticked.

    The choice is kept in the token's `remember` claim, so every refresh (which issues a new refresh
    token) keeps the same lifetime. Tokens issued before this claim existed count as remembered.
    """

    def set_exp(self, claim='exp', from_time=None, lifetime=None):
        if lifetime is None and claim == 'exp':
            lifetime = REMEMBER_ME_SESSION_LIFETIME if self.payload.get('remember', True) else SHORT_SESSION_LIFETIME
        super().set_exp(claim=claim, from_time=from_time, lifetime=lifetime)
