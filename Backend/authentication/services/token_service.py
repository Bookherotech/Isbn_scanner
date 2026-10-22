from django.contrib.auth.models import update_last_login
from rest_framework_simplejwt.settings import api_settings

from authentication.tokens import SessionRefreshToken


def issue_tokens(user, remember=False):
    """The login success payload: {refresh, access, user}. Used by the password login and the OTP step.

    `remember` ("Remember me") makes the sign-in last 30 days instead of 12 hours.
    """
    # Imported here because the serializers package itself imports this services package.
    from authentication.serializers.user_serializer import UserSerializer

    refresh = SessionRefreshToken.for_user(user)
    refresh['role'] = user.role  # the access token inherits it
    refresh['remember'] = bool(remember)
    refresh.set_exp()  # the lifetime depends on `remember`, set just above
    if api_settings.UPDATE_LAST_LOGIN:
        update_last_login(None, user)
    return {'refresh': str(refresh), 'access': str(refresh.access_token), 'user': UserSerializer(user).data}
