from django.core.validators import RegexValidator
from django.db import models
from django.utils import timezone

from inventory.constants import ShelfStatus

# Any mix of letters, numbers and dashes (it is part of URLs, so no spaces or slashes). Stored in capitals,
# so "a1" and "A1" are the same shelf and the unique check catches both.
validate_shelf_code = RegexValidator(r'^[A-Z0-9-]+$', 'Use only letters, numbers and dashes, e.g. A13 or A-13.')


class Shelf(models.Model):
    """A physical shelf, e.g. "A-03". The code is what staff pick and what every screen shows."""

    code = models.CharField(max_length=4, unique=True, validators=[validate_shelf_code])
    status = models.CharField(max_length=10, choices=ShelfStatus.choices, default=ShelfStatus.ACTIVE)
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'inventory_shelves'
        ordering = ['code']

    def __str__(self):
        return self.code

    def clean(self):
        super().clean()
        self.code = (self.code or '').strip().upper()  # before the format and unique checks run

    def save(self, *args, **kwargs):
        self.code = (self.code or '').strip().upper()
        super().save(*args, **kwargs)
