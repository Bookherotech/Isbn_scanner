from rest_framework.response import Response
from rest_framework.views import APIView

from authentication.models import ActionOTP
from authentication.permissions import IsAdminRole
from authentication.serializers import OtpVerifySerializer
from authentication.services import check_can_receive, get_staff_or_404, mask_email, start_action_code, verify_action_code
from authentication.throttles import ActionCodeCheckThrottle


class AdminTransferApproveView(APIView):
    """Step 2 (Admin only): the Super Admin enters the code from their own inbox.

    POST /api/auth/staff/<id>/admin-transfer/approve/ {challenge, otp}
    A correct code approves the transfer and sends a second code to the STAFF member's inbox.
    -> {challenge, email_hint, expires_in}
    """

    permission_classes = [IsAdminRole]
    throttle_classes = [ActionCodeCheckThrottle]

    def post(self, request, pk):
        staff = get_staff_or_404(pk)
        check_can_receive(staff)
        serializer = OtpVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        admin = request.user
        verify_action_code(ActionOTP.Purpose.TRANSFER_CONFIRM, admin, staff, serializer.validated_data['challenge'], serializer.validated_data['otp'])

        challenge = start_action_code(
            ActionOTP.Purpose.TRANSFER_ACCEPT, actor=admin, subject=staff, to_email=staff.email, name=staff.full_name or staff.email
        )
        return Response({'challenge': challenge.token, 'email_hint': mask_email(staff.email), 'expires_in': challenge.expires_in})
