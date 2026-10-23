from django.db import models
from django.utils import timezone


class CreatedAtModel(models.Model):
    """Abstract base for append-only records (activity, notifications): when it happened, newest first."""

    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        abstract = True
        ordering = ['-created_at', '-id']
