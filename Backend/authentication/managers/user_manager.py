from django.contrib.auth.base_user import BaseUserManager

from authentication.constants import Role


class UserManager(BaseUserManager):
    """Creates users that log in with email + password (there is no username)."""

    use_in_migrations = True

    @classmethod
    def normalize_email(cls, email):
        # Always stored lower-cased. (MySQL's case-insensitive collation also keeps the unique index
        # on `email` case-insensitive, even for writes that skip this method.)
        return (email or '').strip().lower()

    def get_by_natural_key(self, email):
        # Used by Django's auth backend on login: "Foo@x.com" must find "foo@x.com".
        return self.get(email=self.normalize_email(email))

    def _create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError('An email address is required.')
        user = self.model(email=self.normalize_email(email), **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault('role', Role.STAFF)
        extra_fields.setdefault('is_staff', False)
        extra_fields.setdefault('is_superuser', False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email, password=None, **extra_fields):
        if not password:
            raise ValueError('A superuser must have a password.')
        extra_fields.setdefault('role', Role.ADMIN)
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        if extra_fields['role'] != Role.ADMIN:
            raise ValueError('A superuser must have the admin role.')
        if extra_fields['is_staff'] is not True or extra_fields['is_superuser'] is not True:
            raise ValueError('A superuser must have is_staff=True and is_superuser=True.')
        return self._create_user(email, password, **extra_fields)
