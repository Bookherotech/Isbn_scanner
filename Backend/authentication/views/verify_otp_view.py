from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from authentication.serializers import OtpVerifySerializer
from authentication.services import issue_tokens, verify_challenge
from authentication.throttles import OtpVerifyThrottle


class VerifyOtpView(APIView):
    """POST /api/auth/login/verify-otp/ {challenge, otp, remember} -> {access, refresh, user}."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [OtpVerifyThrottle]

    def post(self, request):
        serializer = OtpVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user = verify_challenge(data['challenge'], data['otp'])
        return Response(issue_tokens(user, remember=data['remember']))
