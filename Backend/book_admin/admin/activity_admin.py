from django.contrib import admin

from book_admin.models import ActivityLog


@admin.register(ActivityLog)
class ActivityLogAdmin(admin.ModelAdmin):
    list_display = ('created_at', 'actor_type', 'actor', 'action', 'target', 'kind', 'result')
    list_filter = ('kind', 'result', 'actor_type')
    search_fields = ('action', 'target', 'detail')
    list_select_related = ('actor',)
    raw_id_fields = ('actor', 'book')
