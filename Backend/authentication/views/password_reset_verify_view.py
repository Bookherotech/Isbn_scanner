from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from authentication.exceptions import InvalidChallenge
from authentication.serializers import OtpVerifySerializer
from authentication.services import issue_reset_token, verify_password_reset_code
from authentication.throttles import PasswordResetCheckThrottle


class PasswordResetVerifyView(APIView):
    """Step 2: check the code. A right code returns a short-lived ticket for choosing the new password.

    POST /api/auth/password-reset/verify/ {challenge, otp} -> {reset_token}
    """

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [PasswordResetCheckThrottle]

    def post(self, request):
        serializer = OtpVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        row = verify_password_reset_code(serializer.validated_data['challenge'], serializer.validated_data['otp'])
        user = row.actor
        if not user.is_active:  # deactivated since the code was sent
            raise InvalidChallenge()
        return Response({'reset_token': issue_reset_token(user)})
