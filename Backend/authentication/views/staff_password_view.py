from rest_framework.response import Response
from rest_framework.views import APIView

from authentication.permissions import IsAdminRole
from authentication.serializers import StaffPasswordSerializer
from authentication.services import get_staff_or_404


class StaffPasswordView(APIView):
    """Set a new password for a staff member (Admin only).

    POST /api/auth/staff/<id>/password/ {password, confirm_password}
    The staff member's current sessions stop working (their tokens are tied to the old password).
    """

    permission_classes = [IsAdminRole]

    def post(self, request, pk):
        staff = get_staff_or_404(pk)
        serializer = StaffPasswordSerializer(data=request.data, context={'staff': staff})
        serializer.is_valid(raise_exception=True)
        staff.set_password(serializer.validated_data['password'])
        staff.save(update_fields=['password', 'updated_at'])
        return Response({'detail': 'Password updated.'})
