from django.conf import settings
from django.db import models

from book_admin.models.base_class_models import CreatedAtModel


class ActivityLog(CreatedAtModel):
    """One line of the Activity log: who did what, to which book, and how it went. Rows are only ever added."""

    class ActorType(models.TextChoices):
        USER = 'user', 'User'
        SYSTEM = 'system', 'System'  # the duplicate check, the stock check
        SHOPIFY = 'shopify', 'Shopify'

    class Kind(models.TextChoices):
        SUBMISSION = 'submission', 'Submissions'
        APPROVAL = 'approval', 'Approvals'
        REJECTION = 'rejection', 'Rejections'
        WAITING = 'waiting', 'Waiting list'
        STOCK = 'stock', 'Stock'
        NOTIFICATION = 'notification', 'Notifications'
        SHOPIFY = 'shopify', 'Shopify'
        FLAG = 'flag', 'Content flags'
        EDIT = 'edit', 'Edits'
        SHELF = 'shelf', 'Shelves'
        STAFF = 'staff', 'Staff'
        SETTINGS = 'settings', 'Settings'

    class Result(models.TextChoices):
        SUCCESS = 'success', 'Success'
        ERROR = 'error', 'Rejected'
        WARNING = 'warning', 'Attention'
        INFO = 'info', 'Info'

    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')  # null for System / Shopify
    actor_type = models.CharField(max_length=8, choices=ActorType.choices, default=ActorType.USER)
    action = models.CharField(max_length=80)  # "Approved", "Auto-rejected", "Added shelf"
    target = models.CharField(max_length=255, blank=True)  # what it was done to: “Dune”, Shelf A-03
    detail = models.CharField(max_length=255, blank=True)
    kind = models.CharField(max_length=12, choices=Kind.choices)
    result = models.CharField(max_length=8, choices=Result.choices, default=Result.SUCCESS)
    book = models.ForeignKey('inventory.Book', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')

    class Meta(CreatedAtModel.Meta):
        db_table = 'admin_activity_logs'
        indexes = [
            # Activity log filters: WHERE kind = ? ORDER BY created_at DESC / WHERE actor_id = ? ORDER BY created_at DESC
            models.Index(fields=['kind', 'created_at'], name='activity_kind_time_idx'),
            models.Index(fields=['actor', 'created_at'], name='activity_actor_time_idx'),
            # Book detail "History": WHERE book_id = ? ORDER BY created_at DESC
            models.Index(fields=['book', 'created_at'], name='activity_book_time_idx'),
        ]

    def __str__(self):
        return f'{self.action} {self.target}'.strip()
