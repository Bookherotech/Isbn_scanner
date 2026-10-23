from rest_framework import serializers

from book_admin.models import ActivityLog
from book_admin.utils import display_name

SYSTEM_NAMES = {ActivityLog.ActorType.SYSTEM: 'System', ActivityLog.ActorType.SHOPIFY: 'Shopify'}


class ActivitySerializer(serializers.ModelSerializer):
    """One Activity log line. Expects select_related('actor') on the queryset (no extra query per row)."""

    object = serializers.CharField(source='target', read_only=True)
    actor_name = serializers.SerializerMethodField()
    book_id = serializers.IntegerField(read_only=True)

    class Meta:
        model = ActivityLog
        fields = ['id', 'created_at', 'actor', 'actor_type', 'actor_name', 'action', 'object', 'detail', 'kind', 'result', 'book_id']
        read_only_fields = fields

    def get_actor_name(self, row):
        return SYSTEM_NAMES.get(row.actor_type) or display_name(row.actor)
