from rest_framework_simplejwt.serializers import TokenObtainSerializer

from authentication.constants import Role
from authentication.services import issue_tokens, mask_email, start_challenge


class LoginSerializer(TokenObtainSerializer):
    """Email + password in.

    Staff get {access, refresh, user} straight away. A Super Admin (role=admin) gets no tokens yet:
    a 4-digit code is emailed to them and they finish at /login/verify-otp/ with the `challenge`.
    """

    def validate(self, attrs):
        super().validate(attrs)  # checks email + password, sets self.user, rejects inactive accounts
        user = self.user
        if user.role != Role.ADMIN:
            return issue_tokens(user)

        challenge = start_challenge(user)
        return {
            'otp_required': True,
            'challenge': challenge.token,
            'email_hint': mask_email(user.email),
            'expires_in': challenge.expires_in,
        }
