from rest_framework.permissions import AllowAny
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.views import TokenObtainPairView

from authentication.serializers import LoginSerializer


class LoginView(TokenObtainPairView):
    """POST /api/auth/login/ {email, password}.

    Staff: {access, refresh, user}.
    Super Admin: {otp_required, challenge, email_hint, expires_in} - the 4-digit code is emailed,
    then the client calls /login/verify-otp/.
    """

    serializer_class = LoginSerializer
    permission_classes = [AllowAny]
    authentication_classes = []  # nothing to authenticate yet
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'login'  # brute-force protection; the rate is set in settings
