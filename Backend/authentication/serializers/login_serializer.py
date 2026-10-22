from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenObtainSerializer

from authentication.constants import Role
from authentication.exceptions import AccountInactive
from authentication.models import User
from authentication.services import issue_tokens, mask_email, start_challenge


class LoginSerializer(TokenObtainSerializer):
    """Email + password in.

    Staff get {access, refresh, user} straight away. A Super Admin (role=admin) gets no tokens yet:
    a 4-digit code is emailed to them and they finish at /login/verify-otp/ with the `challenge`.
    A deactivated account with the right password gets 403 {code: 'account_inactive'}.
    `remember` ("Remember me") keeps the sign-in for 30 days instead of 12 hours.
    """

    remember = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs):
        try:
            super().validate(attrs)  # checks email + password, sets self.user, rejects inactive accounts
        except AuthenticationFailed:
            self._raise_if_deactivated(attrs)
            raise
        user = self.user
        if user.role != Role.ADMIN:
            return issue_tokens(user, remember=attrs['remember'])

        challenge = start_challenge(user)
        return {
            'otp_required': True,
            'challenge': challenge.token,
            'email_hint': mask_email(user.email),
            'expires_in': challenge.expires_in,
        }

    def _raise_if_deactivated(self, attrs):
        # Only when the password is right, so the message never tells a stranger which accounts exist.
        user = (
            User.objects.filter(email=User.objects.normalize_email(attrs.get(self.username_field)), is_active=False)
            .only('password', 'is_active')
            .first()
        )
        if user and user.check_password(attrs.get('password')):
            raise AccountInactive('Your account has been deactivated. Contact your admin.')
