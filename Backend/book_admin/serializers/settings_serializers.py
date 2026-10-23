from rest_framework import serializers

from book_admin.models import AppSettings


class SettingsSerializer(serializers.ModelSerializer):
    """GET / PATCH /api/admin/settings/. The last stock check time is set by the stock check, not edited here."""

    class Meta:
        model = AppSettings
        fields = ['store_name', 'store_domain', 'store_location', 'shopify_connected', 'stock_poll_minutes', 'reminder_after_hours', 'last_stock_check_at', 'updated_at']
        read_only_fields = ['last_stock_check_at', 'updated_at']
        extra_kwargs = {
            'store_name': {'allow_blank': False, 'error_messages': {'blank': 'Give the store a name.'}},
            'stock_poll_minutes': {'min_value': 1, 'max_value': 1440},
            'reminder_after_hours': {'min_value': 1, 'max_value': 168},
        }
