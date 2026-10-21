from django.apps import AppConfig


class InventoryConfig(AppConfig):
    """Shared book / shelf domain used by both the Staff and the Admin APIs."""

    name = 'inventory'
    default_auto_field = 'django.db.models.BigAutoField'
