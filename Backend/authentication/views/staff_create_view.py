from rest_framework import status
from rest_framework.generics import CreateAPIView
from rest_framework.response import Response

from authentication.permissions import IsAdminRole
from authentication.serializers import StaffCreateSerializer, UserSerializer


class StaffCreateView(CreateAPIView):
    """POST /api/auth/staff/ {full_name, phone_number, email, password, confirm_password} (Admin only).

    Staff sign in with just email + password: the OTP step is only for the Super Admin.
    """

    serializer_class = StaffCreateSerializer
    permission_classes = [IsAdminRole]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)
