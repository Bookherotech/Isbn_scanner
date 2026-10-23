from django.contrib import admin

from book_admin.models import AppSettings


@admin.register(AppSettings)
class AppSettingsAdmin(admin.ModelAdmin):
    list_display = ('store_name', 'shopify_connected', 'stock_poll_minutes', 'reminder_after_hours', 'updated_at')

    def has_add_permission(self, request):
        return not AppSettings.objects.exists()  # one row only

    def has_delete_permission(self, request, obj=None):
        return False
