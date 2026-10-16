from django.shortcuts import get_object_or_404

from authentication.constants import Role
from authentication.models import User


def get_staff_or_404(pk):
    """The Staff user with this id. Admin accounts are never returned, so no admin-only action can touch them."""
    return get_object_or_404(User.objects.filter(role=Role.STAFF), pk=pk)
