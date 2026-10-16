from django.db import models


class Role(models.TextChoices):
    """The two BookHero roles. Admin is the Super Admin; Staff scans and submits books."""

    ADMIN = 'admin', 'Admin'
    STAFF = 'staff', 'Staff'
