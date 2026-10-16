from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from authentication.exceptions import AccountInactive, NoAccountFound
from authentication.managers import UserManager
from authentication.models import ActionOTP, User
from authentication.serializers import PasswordResetRequestSerializer
from authentication.services import mask_email, start_action_code
from authentication.throttles import PasswordResetSendThrottle


class PasswordResetRequestView(APIView):
    """Step 1 of "forgot password": email a 4-digit code to the account's own address.

    POST /api/auth/password-reset/ {email} -> {challenge, email_hint, expires_in}
    No account for that email -> 404 {code: "no_account"}; a deactivated account -> 403 {code: "account_inactive"}.
    """

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [PasswordResetSendThrottle]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = User.objects.filter(email=UserManager.normalize_email(serializer.validated_data['email'])).first()
        if user is None:
            raise NoAccountFound()
        if not user.is_active:
            raise AccountInactive()

        challenge = start_action_code(
            ActionOTP.Purpose.PASSWORD_RESET, actor=user, subject=user, to_email=user.email, name=user.full_name or user.email
        )
        return Response({'challenge': challenge.token, 'email_hint': mask_email(user.email), 'expires_in': challenge.expires_in})
