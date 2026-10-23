from rest_framework import serializers

from book_admin.models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    """A notification for the signed-in user. Expects the `is_read` annotation (see views.notification_views)."""

    item_id = serializers.IntegerField(source='book_id', read_only=True)
    read = serializers.BooleanField(source='is_read', read_only=True)

    class Meta:
        model = Notification
        fields = ['id', 'type', 'title', 'body', 'push', 'created_at', 'item_id', 'read']
        read_only_fields = fields
