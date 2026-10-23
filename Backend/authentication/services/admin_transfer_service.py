from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from authentication.constants import ADMIN_TRANSFER_APPROVAL_SECONDS, Role
from authentication.exceptions import TransferNotAllowed, TransferNotApproved
from authentication.models import ActionOTP, User


def check_can_receive(staff):
    """Only an active staff account can be made Super Admin."""
    if not staff.is_active:
        raise TransferNotAllowed()


def require_approval(admin, staff):
    """The admin approved this transfer with their own code a short while ago (step 2 was done)."""
    since = timezone.now() - timedelta(seconds=ADMIN_TRANSFER_APPROVAL_SECONDS)
    approved = ActionOTP.objects.filter(
        purpose=ActionOTP.Purpose.TRANSFER_CONFIRM, actor=admin, subject=staff, used_at__gte=since
    ).exists()
    if not approved:
        raise TransferNotApproved()


def transfer_super_admin(admin, staff):
    """Swap the roles: the staff member becomes the Super Admin and the old Super Admin becomes staff.

    Both rows are locked so two transfers cannot run at the same time. Returns (new_admin, old_admin).
    """
    with transaction.atomic():
        users = {u.pk: u for u in User.objects.select_for_update().filter(pk__in=[admin.pk, staff.pk])}
        old_admin, new_admin = users.get(admin.pk), users.get(staff.pk)
        if old_admin is None or old_admin.role != Role.ADMIN:
            raise TransferNotApproved()
        if new_admin is None or new_admin.role != Role.STAFF:
            raise TransferNotAllowed()
        check_can_receive(new_admin)

        new_admin.role, new_admin.is_staff, new_admin.is_superuser = Role.ADMIN, True, True
        old_admin.role, old_admin.is_staff, old_admin.is_superuser = Role.STAFF, False, False
        fields = ['role', 'is_staff', 'is_superuser', 'updated_at']
        new_admin.save(update_fields=fields)
        old_admin.save(update_fields=fields)
        # The transfer codes are finished with.
        ActionOTP.objects.filter(
            purpose__in=[ActionOTP.Purpose.TRANSFER_CONFIRM, ActionOTP.Purpose.TRANSFER_ACCEPT], actor=admin, subject=staff
        ).delete()
    return new_admin, old_admin
