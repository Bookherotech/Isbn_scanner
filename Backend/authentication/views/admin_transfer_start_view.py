from rest_framework.response import Response
from rest_framework.views import APIView

from authentication.models import ActionOTP
from authentication.permissions import IsAdminRole
from authentication.services import check_can_receive, get_staff_or_404, mask_email, start_action_code
from authentication.throttles import ActionCodeSendThrottle


class AdminTransferStartView(APIView):
    """Step 1 of making a staff member the Super Admin (Admin only).

    POST /api/auth/staff/<id>/admin-transfer/
    Nothing changes yet. A 4-digit code is sent to the CURRENT Super Admin's own inbox.
    -> {challenge, email_hint, expires_in}
    """

    permission_classes = [IsAdminRole]
    throttle_classes = [ActionCodeSendThrottle]

    def post(self, request, pk):
        staff = get_staff_or_404(pk)
        check_can_receive(staff)
        admin = request.user
        challenge = start_action_code(
            ActionOTP.Purpose.TRANSFER_CONFIRM, actor=admin, subject=staff, to_email=admin.email, name=admin.full_name or admin.email
        )
        return Response({'challenge': challenge.token, 'email_hint': mask_email(admin.email), 'expires_in': challenge.expires_in})
