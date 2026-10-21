from django.core.validators import RegexValidator
from django.db import models
from django.utils import timezone

from inventory.constants import ShelfStatus

validate_shelf_code = RegexValidator(r'^[A-Z]-\d{2}$', 'Use the format letter-dash-two digits, e.g. A-13.')


class Shelf(models.Model):
    """A physical shelf, e.g. "A-03". The code is what staff pick and what every screen shows."""

    code = models.CharField(max_length=4, unique=True, validators=[validate_shelf_code])
    zone = models.CharField(max_length=1, editable=False)  # first letter of the code, set on save
    status = models.CharField(max_length=10, choices=ShelfStatus.choices, default=ShelfStatus.ACTIVE)
    note = models.CharField(max_length=255, blank=True)
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
        self.zone = self.code[:1]
        super().save(*args, **kwargs)
