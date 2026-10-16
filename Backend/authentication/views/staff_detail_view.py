from rest_framework.generics import RetrieveUpdateDestroyAPIView
from rest_framework.response import Response

from authentication.constants import Role
from authentication.models import User
from authentication.permissions import IsAdminRole
from authentication.serializers import StaffUpdateSerializer, UserSerializer


class StaffDetailView(RetrieveUpdateDestroyAPIView):
    """Admin only. Works on Staff users only: an admin account can never be edited or deleted here.

    PATCH  /api/auth/staff/<id>/  {full_name?, phone_number?, email?, is_active?}  edit, or activate / deactivate
    DELETE /api/auth/staff/<id>/                                                   delete the account for good
    """

    http_method_names = ['patch', 'delete', 'options']
    permission_classes = [IsAdminRole]
    serializer_class = StaffUpdateSerializer

    def get_queryset(self):
        return User.objects.filter(role=Role.STAFF)

    def update(self, request, *args, **kwargs):
        serializer = StaffUpdateSerializer(self.get_object(), data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        return Response(UserSerializer(serializer.save()).data)
