from django.contrib import admin

from inventory.models import Shelf


@admin.register(Shelf)
class ShelfAdmin(admin.ModelAdmin):
    """Add / deactivate shelves until the Admin dashboard's Shelves page is connected."""

    list_display = ('code', 'zone', 'status', 'note', 'created_at')
    list_filter = ('status', 'zone')
    search_fields = ('^code',)
    readonly_fields = ('zone', 'created_at')
    fields = ('code', 'zone', 'status', 'note', 'created_at')
