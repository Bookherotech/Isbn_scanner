from rest_framework.response import Response
from rest_framework.views import APIView

from authentication.models import ActionOTP
from authentication.permissions import IsAdminRole
from authentication.serializers import OtpVerifySerializer, UserSerializer
from authentication.services import get_staff_or_404, require_approval, transfer_super_admin, verify_action_code
from authentication.throttles import ActionCodeCheckThrottle


class AdminTransferCompleteView(APIView):
    """Step 3 (Admin only): the code from the STAFF member's inbox completes the transfer.

    POST /api/auth/staff/<id>/admin-transfer/complete/ {challenge, otp}
    The staff member becomes the Super Admin and the current Super Admin becomes staff.
    -> {new_admin, you}
    """

    permission_classes = [IsAdminRole]
    throttle_classes = [ActionCodeCheckThrottle]

    def post(self, request, pk):
        staff = get_staff_or_404(pk)
        serializer = OtpVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        admin = request.user
        require_approval(admin, staff)
        verify_action_code(ActionOTP.Purpose.TRANSFER_ACCEPT, admin, staff, serializer.validated_data['challenge'], serializer.validated_data['otp'])

        new_admin, old_admin = transfer_super_admin(admin, staff)
        return Response({'new_admin': UserSerializer(new_admin).data, 'you': UserSerializer(old_admin).data})
