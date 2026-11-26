from django.apps import AppConfig
from django.db.models.signals import post_migrate


class InventoryConfig(AppConfig):
    """Shared book / shelf domain used by both the Staff and the Admin APIs."""

    name = 'inventory'
    default_auto_field = 'django.db.models.BigAutoField'

    def ready(self):
        from inventory.services.fulltext import ensure_fulltext_index

        # The books' FULLTEXT index (title, author) is added after every migrate when missing: see inventory.services.fulltext.
        post_migrate.connect(ensure_fulltext_index, sender=self, dispatch_uid='inventory_fulltext_index')
