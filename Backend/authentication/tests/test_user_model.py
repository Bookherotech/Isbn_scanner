import os
from io import StringIO
from unittest import mock

from django.core.management import call_command
from django.db import IntegrityError, connection, transaction
from django.test import TestCase

from authentication.constants import Role
from authentication.models import User


class UserManagerTests(TestCase):
    def test_create_user_defaults_to_staff_with_hashed_password(self):
        user = User.objects.create_user('Staff.One@BookHero.com ', 'pass-12345-xyz')
        self.assertEqual(user.email, 'staff.one@bookhero.com')
        self.assertEqual(user.role, Role.STAFF)
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertNotEqual(user.password, 'pass-12345-xyz')
        self.assertTrue(user.check_password('pass-12345-xyz'))

    def test_create_user_requires_email(self):
        with self.assertRaisesMessage(ValueError, 'email address is required'):
            User.objects.create_user('', 'pass-12345-xyz')

    def test_create_superuser_is_admin_with_full_flags(self):
        user = User.objects.create_superuser('Boss@BookHero.com', 'pass-12345-xyz')
        self.assertEqual(user.email, 'boss@bookhero.com')
        self.assertEqual(user.role, Role.ADMIN)
        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_superuser)
        self.assertTrue(user.is_admin_role)

    def test_create_superuser_requires_password_and_admin_role(self):
        with self.assertRaisesMessage(ValueError, 'must have a password'):
            User.objects.create_superuser('boss@bookhero.com', '')
        with self.assertRaisesMessage(ValueError, 'admin role'):
            User.objects.create_superuser('boss@bookhero.com', 'pass-12345-xyz', role=Role.STAFF)

    def test_lookup_by_email_is_case_insensitive(self):
        user = User.objects.create_user('lookup@bookhero.com', 'pass-12345-xyz')
        self.assertEqual(User.objects.get_by_natural_key('LOOKUP@BookHero.com'), user)

    def test_email_is_unique_regardless_of_case(self):
        User.objects.create_user('same@bookhero.com', 'pass-12345-xyz')
        with self.assertRaises(IntegrityError), transaction.atomic():
            User.objects.create_user('SAME@bookhero.com', 'pass-12345-xyz')


class UserConstraintTests(TestCase):
    def test_database_treats_emails_case_insensitively_even_when_save_is_bypassed(self):
        User.objects.create_user('dup@bookhero.com', 'pass-12345-xyz')
        with self.assertRaises(IntegrityError), transaction.atomic():
            User.objects.bulk_create([User(email='DUP@bookhero.com')])  # bulk_create skips save()

    def test_indexes_exist(self):
        with connection.cursor() as cursor:
            constraints = connection.introspection.get_constraints(cursor, User._meta.db_table)
        self.assertIn('user_role_active_idx', constraints)
        self.assertEqual(constraints['user_role_active_idx']['columns'], ['role', 'is_active'])
        unique_email = [c for c in constraints.values() if c['unique'] and c['columns'] == ['email']]
        self.assertTrue(unique_email, 'email needs a unique index')


class CreateSuperuserCommandTests(TestCase):
    def test_createsuperuser_with_email_and_password(self):
        with mock.patch.dict(os.environ, {'DJANGO_SUPERUSER_PASSWORD': 'pass-12345-xyz'}):
            call_command('createsuperuser', interactive=False, email='Root@BookHero.com', stdout=StringIO())
        user = User.objects.get(email='root@bookhero.com')
        self.assertTrue(user.is_superuser)
        self.assertEqual(user.role, Role.ADMIN)
        self.assertTrue(user.check_password('pass-12345-xyz'))
