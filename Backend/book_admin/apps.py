from django.apps import AppConfig


class BookAdminConfig(AppConfig):
    name = 'book_admin'
    default_auto_field = 'django.db.models.BigAutoField'

    def ready(self):
        from book_admin import signals  # noqa: F401  (connects the receivers)
