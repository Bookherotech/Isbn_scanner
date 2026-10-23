from django.contrib import admin

from book_admin.models import FlagCategory


@admin.register(FlagCategory)
class FlagCategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'mode', 'enabled', 'updated_at')
    list_filter = ('mode', 'enabled')
    search_fields = ('name', 'description')
