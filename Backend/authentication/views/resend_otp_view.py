from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from authentication.serializers import OtpResendSerializer
from authentication.services import resend_challenge
from authentication.throttles import OtpResendThrottle


class ResendOtpView(APIView):
    """POST /api/auth/login/resend-otp/ {challenge} -> {expires_in}. Emails a new code."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [OtpResendThrottle]

    def post(self, request):
        serializer = OtpResendSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        challenge = resend_challenge(serializer.validated_data['challenge'])
        return Response({'expires_in': challenge.expires_in})
