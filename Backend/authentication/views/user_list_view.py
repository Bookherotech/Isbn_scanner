from rest_framework.exceptions import ValidationError
from rest_framework.generics import ListAPIView

from authentication.constants import Role
from authentication.models import User
from authentication.pagination import UserCursorPagination
from authentication.permissions import IsAdminRole
from authentication.serializers import UserSerializer


class UserListView(ListAPIView):
    """GET /api/auth/users/?role=&is_active=&q= (Admin only).

    One query per page: only the needed columns are loaded, there are no relations to
    follow (so no N+1), and keyset pagination avoids COUNT(*) and OFFSET.
    """

    serializer_class = UserSerializer
    permission_classes = [IsAdminRole]
    pagination_class = UserCursorPagination

    def get_queryset(self):
        params = self.request.query_params
        queryset = User.objects.only(*UserSerializer.Meta.fields)

        role = params.get('role')
        if role:
            if role not in Role.values:
                raise ValidationError({'role': f'Must be one of: {", ".join(Role.values)}.'})
            queryset = queryset.filter(role=role)

        is_active = params.get('is_active')
        if is_active is not None:
            if is_active.lower() not in ('true', 'false'):
                raise ValidationError({'is_active': 'Must be true or false.'})
            queryset = queryset.filter(is_active=is_active.lower() == 'true')

        prefix = params.get('q', '').strip().lower()
        if prefix:
            queryset = queryset.filter(email__startswith=prefix)  # a prefix match can use the email index
        return queryset
