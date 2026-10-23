from rest_framework.response import Response
from rest_framework.views import APIView

from authentication.models import ActionOTP
from authentication.permissions import IsAdminRole
from authentication.services import check_can_receive, get_staff_or_404, mask_email, require_approval, start_action_code
from authentication.throttles import ActionCodeSendThrottle


class AdminTransferResendView(APIView):
    """Send the STAFF member's code again (Admin only), after the Super Admin has approved.

    POST /api/auth/staff/<id>/admin-transfer/resend/ -> {challenge, email_hint, expires_in}
    """

    permission_classes = [IsAdminRole]
    throttle_classes = [ActionCodeSendThrottle]

    def post(self, request, pk):
        staff = get_staff_or_404(pk)
        check_can_receive(staff)
        admin = request.user
        require_approval(admin, staff)
        challenge = start_action_code(
            ActionOTP.Purpose.TRANSFER_ACCEPT, actor=admin, subject=staff, to_email=staff.email, name=staff.full_name or staff.email
        )
        return Response({'challenge': challenge.token, 'email_hint': mask_email(staff.email), 'expires_in': challenge.expires_in})
