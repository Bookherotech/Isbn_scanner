from rest_framework.response import Response
from rest_framework.views import APIView

from authentication.models import ActionOTP
from authentication.permissions import IsAdminRole
from authentication.serializers import EmailChangeStartSerializer
from authentication.services import get_staff_or_404, mask_email, start_action_code
from authentication.throttles import ActionCodeSendThrottle


class StaffEmailChangeView(APIView):
    """Step 1 of changing a staff member's email (Admin only).

    POST /api/auth/staff/<id>/email-change/ {new_email}
    The email is NOT changed yet. A 4-digit code is sent to the ADMIN's own inbox to approve it.
    -> {challenge, email_hint, new_email, expires_in}
    """

    permission_classes = [IsAdminRole]
    throttle_classes = [ActionCodeSendThrottle]

    def post(self, request, pk):
        staff = get_staff_or_404(pk)
        serializer = EmailChangeStartSerializer(data=request.data, context={'staff': staff})
        serializer.is_valid(raise_exception=True)
        new_email = serializer.validated_data['new_email']

        admin = request.user
        challenge = start_action_code(
            ActionOTP.Purpose.EMAIL_CHANGE,
            actor=admin,
            subject=staff,
            to_email=admin.email,
            name=admin.full_name or admin.email,
            new_email=new_email,
        )
        return Response(
            {'challenge': challenge.token, 'email_hint': mask_email(admin.email), 'new_email': new_email, 'expires_in': challenge.expires_in}
        )
