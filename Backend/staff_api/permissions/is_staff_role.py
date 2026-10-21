from rest_framework.permissions import BasePermission

from authentication.constants import Role


class IsStaffRole(BasePermission):
    """Only users with the Staff role (the staff portal)."""

    message = 'Staff access required.'

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.role == Role.STAFF)
