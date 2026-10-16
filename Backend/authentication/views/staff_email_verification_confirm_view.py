from rest_framework.response import Response
from rest_framework.views import APIView

from authentication.models import ActionOTP
from authentication.permissions import IsAdminRole
from authentication.serializers import OtpVerifySerializer, UserSerializer
from authentication.services import get_staff_or_404, verify_action_code
from authentication.throttles import ActionCodeCheckThrottle


class StaffEmailVerificationConfirmView(APIView):
    """The admin enters the code that arrived in the staff member's inbox (Admin only).

    POST /api/auth/staff/<id>/email-verification/confirm/ {challenge, otp}
    A correct code marks the address as verified. -> the user
    """

    permission_classes = [IsAdminRole]
    throttle_classes = [ActionCodeCheckThrottle]

    def post(self, request, pk):
        staff = get_staff_or_404(pk)
        serializer = OtpVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        verify_action_code(ActionOTP.Purpose.EMAIL_VERIFY, request.user, staff, serializer.validated_data['challenge'], serializer.validated_data['otp'])
        if not staff.email_verified:
            staff.email_verified = True
            staff.save(update_fields=['email_verified', 'updated_at'])
        return Response(UserSerializer(staff).data)
