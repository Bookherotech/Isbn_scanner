from django.conf import settings
from django.db import models

from book_admin.models.base_class_models import CreatedAtModel


class BlockedBook(CreatedAtModel):
    """A book the store does not take (the "Blocked books" master). When staff scan this ISBN the lookup refuses it,
    and a submission of it is saved as auto-rejected. The details are a copy of the lookup the admin saw when adding it."""

    isbn = models.CharField(max_length=13, unique=True)  # ISBN-13
    title = models.CharField(max_length=255, blank=True)
    author = models.CharField(max_length=255, blank=True)
    publisher = models.CharField(max_length=255, blank=True)
    year = models.PositiveSmallIntegerField(null=True, blank=True)
    cover_url = models.URLField(max_length=500, blank=True)
    reason = models.CharField(max_length=200, blank=True)  # shown to staff when they scan it
    added_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')

    class Meta:
        db_table = 'admin_blocked_books'
        ordering = ['-created_at', '-id']

    def __str__(self):
        return f'{self.isbn} {self.title}'.strip()
