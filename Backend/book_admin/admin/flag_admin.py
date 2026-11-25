from django.contrib import admin

from book_admin.models import BlockedBook, FlagCategory


@admin.register(FlagCategory)
class FlagCategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'mode', 'enabled', 'updated_at')
    list_filter = ('mode', 'enabled')
    search_fields = ('name', 'description')


@admin.register(BlockedBook)
class BlockedBookAdmin(admin.ModelAdmin):
    list_display = ('isbn', 'title', 'author', 'reason', 'created_at')
    search_fields = ('isbn', 'title', 'author')
