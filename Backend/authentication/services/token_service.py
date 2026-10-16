from django.contrib.auth.models import update_last_login
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.tokens import RefreshToken


def issue_tokens(user):
    """The login success payload: {refresh, access, user}. Used by the password login and the OTP step."""
    # Imported here because the serializers package itself imports this services package.
    from authentication.serializers.user_serializer import UserSerializer

    refresh = RefreshToken.for_user(user)
    refresh['role'] = user.role  # the access token inherits it
    if api_settings.UPDATE_LAST_LOGIN:
        update_last_login(None, user)
    return {'refresh': str(refresh), 'access': str(refresh.access_token), 'user': UserSerializer(user).data}
