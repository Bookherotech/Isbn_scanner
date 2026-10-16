from django.core.cache import cache
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from rest_framework.test import APITestCase

from authentication.constants import Role
from authentication.models import User
from authentication.tests.helpers import sign_in

PASSWORD = 'pass-12345-xyz'


class ProfileApiTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.url = reverse('authentication:me')
        self.staff = User.objects.create_user('sarah@bookhero.com', PASSWORD, full_name='Sarah Wilson', phone_number='+919876543210')
        self.other = User.objects.create_user('other@bookhero.com', PASSWORD, full_name='Other Person', phone_number='+14155552671')
        tokens = sign_in(self.client, 'sarah@bookhero.com', PASSWORD).data
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {tokens["access"]}')

    def test_get_returns_the_users_details(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['email'], 'sarah@bookhero.com')
        self.assertEqual(response.data['full_name'], 'Sarah Wilson')
        self.assertEqual(response.data['phone_number'], '+919876543210')

    def test_patch_updates_name_and_phone(self):
        response = self.client.patch(self.url, {'full_name': 'Sarah W. Lee', 'phone_number': '+44 20 7183 8750'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['full_name'], 'Sarah W. Lee')
        self.assertEqual(response.data['phone_number'], '+442071838750')
        self.staff.refresh_from_db()
        self.assertEqual((self.staff.full_name, self.staff.phone_number), ('Sarah W. Lee', '+442071838750'))

    def test_partial_update_changes_only_the_given_field(self):
        self.client.patch(self.url, {'phone_number': '+971501234567'}, format='json')
        self.staff.refresh_from_db()
        self.assertEqual(self.staff.full_name, 'Sarah Wilson')
        self.assertEqual(self.staff.phone_number, '+971501234567')

    def test_the_email_cannot_be_changed(self):
        response = self.client.patch(self.url, {'email': 'hacker@evil.com', 'full_name': 'Sarah Wilson'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['email'], 'sarah@bookhero.com')
        self.staff.refresh_from_db()
        self.assertEqual(self.staff.email, 'sarah@bookhero.com')
        self.assertFalse(User.objects.filter(email='hacker@evil.com').exists())

    def test_role_and_status_cannot_be_changed(self):
        self.client.patch(self.url, {'role': 'admin', 'is_active': False, 'is_superuser': True, 'is_staff': True}, format='json')
        self.staff.refresh_from_db()
        self.assertEqual(self.staff.role, Role.STAFF)
        self.assertTrue(self.staff.is_active)
        self.assertFalse(self.staff.is_superuser)
        self.assertFalse(self.staff.is_staff)

    def test_only_your_own_profile_is_touched(self):
        self.client.patch(self.url, {'full_name': 'Changed'}, format='json')
        self.other.refresh_from_db()
        self.assertEqual(self.other.full_name, 'Other Person')

    def test_invalid_values_are_rejected(self):
        for body, field in [({'phone_number': '9876543210'}, 'phone_number'), ({'phone_number': '+12'}, 'phone_number'), ({'full_name': '   '}, 'full_name'), ({'full_name': 'x' * 151}, 'full_name')]:
            response = self.client.patch(self.url, body, format='json')
            self.assertEqual(response.status_code, 400, body)
            self.assertIn(field, response.data, body)
        self.staff.refresh_from_db()
        self.assertEqual((self.staff.full_name, self.staff.phone_number), ('Sarah Wilson', '+919876543210'))

    def test_requires_sign_in(self):
        self.client.credentials()
        self.assertEqual(self.client.get(self.url).status_code, 401)
        self.assertEqual(self.client.patch(self.url, {'full_name': 'x'}, format='json').status_code, 401)

    def test_put_and_delete_are_not_allowed(self):
        self.assertEqual(self.client.put(self.url, {'full_name': 'x', 'phone_number': '+919876543210'}, format='json').status_code, 405)
        self.assertEqual(self.client.delete(self.url).status_code, 405)

    def test_unchanged_patch_writes_nothing_and_a_change_is_one_update(self):
        with CaptureQueriesContext(connection) as queries:
            self.client.patch(self.url, {'full_name': 'Sarah Wilson'}, format='json')
        self.assertEqual([q for q in queries if q['sql'].startswith('UPDATE')], [])
        with CaptureQueriesContext(connection) as queries:
            self.client.patch(self.url, {'full_name': 'Sarah New'}, format='json')
        updates = [q['sql'] for q in queries if q['sql'].startswith('UPDATE')]
        self.assertEqual(len(updates), 1)
        self.assertNotIn('password', updates[0])  # only the changed columns, not the whole row
