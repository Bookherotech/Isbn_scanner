from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import AllowAny
from rest_framework_simplejwt.views import TokenRefreshView

from authentication.models import User


class RefreshView(TokenRefreshView):
    """POST /api/auth/token/refresh/ {refresh} -> {access, refresh}."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request, *args, **kwargs):
        try:
            return super().post(request, *args, **kwargs)
        except User.DoesNotExist:
            # A token of a deleted account: refuse it (the library would crash with a 500).
            raise AuthenticationFailed('No active account found for the given token.', 'no_active_account') from None
