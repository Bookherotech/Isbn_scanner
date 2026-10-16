from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from authentication.serializers import PasswordResetConfirmSerializer
from authentication.throttles import PasswordResetCheckThrottle


class PasswordResetConfirmView(APIView):
    """Step 3: choose the new password with the ticket from step 2.

    POST /api/auth/password-reset/confirm/ {reset_token, password, confirm_password}
    The ticket works once (it is tied to the old password). Every old session of the account stops working.
    """

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [PasswordResetCheckThrottle]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']
        user.set_password(serializer.validated_data['password'])
        user.save(update_fields=['password', 'updated_at'])
        return Response({'detail': 'Password changed.'})
