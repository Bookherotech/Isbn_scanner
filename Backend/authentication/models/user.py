from django.contrib.auth.base_user import AbstractBaseUser
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from django.utils import timezone

from authentication.constants import Role
from authentication.managers import UserManager
from authentication.validators import validate_phone_number


class User(AbstractBaseUser, PermissionsMixin):
    """BookHero user. Logs in with email + password; `role` is Admin (Super Admin) or Staff."""

    email = models.EmailField(max_length=254, unique=True)  # unique => indexed; the login lookup key. MySQL's default collation makes it case-insensitive
    full_name = models.CharField(max_length=150, blank=True)
    phone_number = models.CharField(max_length=20, blank=True, default='', validators=[validate_phone_number])  # +<country code><number>
    email_verified = models.BooleanField(default=True)  # False after an admin changes the email, until the new address confirms a code
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.STAFF)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False, help_text='Can sign in to the Django admin site.')
    date_joined = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    EMAIL_FIELD = 'email'
    REQUIRED_FIELDS = []  # createsuperuser asks only for email + password

    class Meta:
        db_table = 'auth_users'
        indexes = [
            # Admin "staff list" filters: WHERE role = ? AND is_active = ? ORDER BY id
            models.Index(fields=['role', 'is_active'], name='user_role_active_idx'),
        ]

    def __str__(self):
        return self.email

    def clean(self):
        super().clean()
        # Runs in forms/admin before constraints and unique checks are validated.
        self.email = UserManager.normalize_email(self.email)

    def save(self, *args, **kwargs):
        self.email = UserManager.normalize_email(self.email)
        super().save(*args, **kwargs)

    @property
    def is_admin_role(self):
        return self.role == Role.ADMIN
