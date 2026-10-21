from django.db import models


class ShelfStatus(models.TextChoices):
    """Only active shelves are offered to staff in the shelf picker."""

    ACTIVE = 'active', 'Active'
    INACTIVE = 'inactive', 'Inactive'
