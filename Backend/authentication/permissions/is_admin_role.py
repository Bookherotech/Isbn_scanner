from rest_framework.permissions import BasePermission

from authentication.constants import Role


class IsAdminRole(BasePermission):
    """Only users with the Admin (Super Admin) role."""

    message = 'Admin access required.'

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.role == Role.ADMIN)
