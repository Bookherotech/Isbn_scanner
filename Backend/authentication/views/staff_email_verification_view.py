from rest_framework.response import Response
from rest_framework.views import APIView

from authentication.exceptions import OtpError
from authentication.models import ActionOTP
from authentication.permissions import IsAdminRole
from authentication.services import get_staff_or_404, mask_email, start_action_code
from authentication.throttles import ActionCodeSendThrottle


class AlreadyVerified(OtpError):
    default_detail = 'This email is already verified.'
    default_code = 'already_verified'


class StaffEmailVerificationView(APIView):
    """Send (or send again) the "is this address real?" code to a staff member's current email (Admin only).

    POST /api/auth/staff/<id>/email-verification/
    Only for staff whose email is not verified yet. -> {challenge, email_hint, expires_in}
    """

    permission_classes = [IsAdminRole]
    throttle_classes = [ActionCodeSendThrottle]

    def post(self, request, pk):
        staff = get_staff_or_404(pk)
        if staff.email_verified:
            raise AlreadyVerified()
        challenge = start_action_code(
            ActionOTP.Purpose.EMAIL_VERIFY, actor=request.user, subject=staff, to_email=staff.email, name=staff.full_name or staff.email
        )
        return Response({'challenge': challenge.token, 'email_hint': mask_email(staff.email), 'expires_in': challenge.expires_in})
