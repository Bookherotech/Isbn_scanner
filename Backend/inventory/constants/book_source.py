from django.db import models


class BookSource(models.TextChoices):
    """Where the book details came from."""

    GOOGLE = 'google', 'Google Books'
    OPEN_LIBRARY = 'openlibrary', 'Open Library'
    MANUAL = 'manual', 'Manual entry'
