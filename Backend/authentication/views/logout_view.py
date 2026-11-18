from datetime import datetime, timezone as dt_timezone

from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError

from authentication.models import RevokedSession
from authentication.tokens import SessionRefreshToken


class LogoutView(APIView):
    """POST /api/auth/logout/ {refresh} -> 204. Ends the sign-in on the server: its refresh tokens stop working.

    No access token needed (it may already be expired). An expired, invalid or already revoked token is
    nothing to revoke, so it also answers 204: signing out never fails.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        raw = request.data.get('refresh') if isinstance(request.data, dict) else None
        if isinstance(raw, str) and raw:
            try:
                token = SessionRefreshToken(raw)
            except TokenError:
                token = None
            if token is not None and token.session_key:
                expires_at = datetime.fromtimestamp(token['exp'], tz=dt_timezone.utc)
                RevokedSession.objects.get_or_create(key=token.session_key, defaults={'expires_at': expires_at})
        RevokedSession.objects.filter(expires_at__lt=timezone.now()).delete()  # those tokens are expired anyway
        return Response(status=status.HTTP_204_NO_CONTENT)
