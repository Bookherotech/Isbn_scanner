from django.contrib import admin

from book_admin.models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('created_at', 'type', 'audience', 'recipient', 'title', 'push')
    list_filter = ('type', 'audience', 'push')
    search_fields = ('title', 'body')
    list_select_related = ('recipient',)
    raw_id_fields = ('recipient', 'book')
