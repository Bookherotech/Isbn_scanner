from django.apps import AppConfig


class StaffApiConfig(AppConfig):
    """Staff portal APIs: ISBN lookup, shelves, book submissions, submission history. No models of its own."""

    name = 'staff_api'
    default_auto_field = 'django.db.models.BigAutoField'
