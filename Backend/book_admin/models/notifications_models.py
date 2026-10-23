from django.conf import settings
from django.db import models

from book_admin.models.base_class_models import CreatedAtModel


class Notification(CreatedAtModel):
    """An in-app notification for a whole audience (everyone / all admins / all staff) or for one person.

    Whether someone has read it is kept per person in NotificationRead, so one row serves the whole audience.
    """

    class Type(models.TextChoices):
        STOCK_OUT = 'stock_out', 'Stock out'
        STOCK_OUT_REMINDER = 'stock_out_reminder', '24 h reminder'
        WAITING_READY = 'waiting_ready', 'Waiting list ready'
        WAITING_CREATED = 'waiting_created', 'Waiting list'
        WAITING_APPROVED = 'waiting_approved', 'Back in stock'
        NEW_SUBMISSION = 'new_submission', 'New submission'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'
        SYNC_FAILED = 'sync_failed', 'Shopify sync'
        FLAGGED = 'flagged', 'Content flag'

    class Audience(models.TextChoices):
        ALL = 'all', 'Everyone'
        ADMIN = 'admin', 'Admins'
        STAFF = 'staff', 'Staff'
        PERSON = '', 'One person'  # see `recipient`

    type = models.CharField(max_length=20, choices=Type.choices)
    audience = models.CharField(max_length=5, choices=Audience.choices, blank=True, default='')
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True, blank=True, related_name='+')  # set when audience is blank
    title = models.CharField(max_length=120)
    body = models.CharField(max_length=500)
    push = models.BooleanField(default=True)  # also shown as a browser push, not only in the list
    book = models.ForeignKey('inventory.Book', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')

    class Meta(CreatedAtModel.Meta):
        db_table = 'admin_notifications'
        indexes = [
            # A user's feed: WHERE audience IN ('all', <role>) ORDER BY created_at DESC, and WHERE recipient_id = ? ORDER BY created_at DESC
            models.Index(fields=['audience', 'created_at'], name='notif_audience_time_idx'),
            models.Index(fields=['recipient', 'created_at'], name='notif_recipient_time_idx'),
        ]

    def __str__(self):
        return f'{self.type}: {self.title}'


class NotificationRead(models.Model):
    """"This person has read this notification"."""

    notification = models.ForeignKey(Notification, on_delete=models.CASCADE, related_name='reads')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='+')
    read_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'admin_notification_reads'
        constraints = [models.UniqueConstraint(fields=['notification', 'user'], name='notification_read_once')]
