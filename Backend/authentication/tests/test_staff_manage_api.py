from django.core.cache import cache
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from rest_framework.test import APIClient, APITestCase

from authentication.constants import Role
from authentication.models import User
from authentication.tests.helpers import sign_in

PASSWORD = 'pass-12345-xyz'
STAFF_PASSWORD = 'Sturdy-Pass-2026!'


class StaffManageApiTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_superuser('admin@bookhero.com', PASSWORD, full_name='Rachel Morgan')
        self.staff = User.objects.create_user('sarah@bookhero.com', STAFF_PASSWORD, full_name='Sarah Wilson', phone_number='+919876543210')
        self.url = reverse('authentication:staff-detail', args=[self.staff.pk])
        tokens = sign_in(self.client, 'admin@bookhero.com', PASSWORD).data
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {tokens["access"]}')

    def patch(self, body, url=None):
        return self.client.patch(url or self.url, body, format='json')

    def staff_client(self):
        """A separate client signed in as the staff member (their own tokens)."""
        client = APIClient()
        tokens = client.post(reverse('authentication:login'), {'email': 'sarah@bookhero.com', 'password': STAFF_PASSWORD}, format='json').data
        return client, tokens

    # ---- edit ----
    def test_admin_edits_name_and_phone(self):
        response = self.patch({'full_name': 'Sarah W. Lee', 'phone_number': '+44 20 7183 8750'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual((response.data['full_name'], response.data['phone_number']), ('Sarah W. Lee', '+442071838750'))
        self.staff.refresh_from_db()
        self.assertEqual((self.staff.full_name, self.staff.phone_number), ('Sarah W. Lee', '+442071838750'))
        self.assertTrue(self.staff.check_password(STAFF_PASSWORD))  # the password is untouched

    def test_the_email_cannot_be_changed_with_a_plain_patch(self):
        # It has to go through the two-code flow (email-change endpoints), so it is ignored here.
        response = self.patch({'email': 'new@bookhero.com', 'full_name': 'Sarah Wilson'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['email'], 'sarah@bookhero.com')
        self.staff.refresh_from_db()
        self.assertEqual(self.staff.email, 'sarah@bookhero.com')

    def test_invalid_values_are_rejected(self):
        for body, field in [({'phone_number': '9876543210'}, 'phone_number'), ({'full_name': '  '}, 'full_name'), ({'is_active': 'maybe'}, 'is_active')]:
            response = self.patch(body)
            self.assertEqual(response.status_code, 400, body)
            self.assertIn(field, response.data, body)
        self.staff.refresh_from_db()
        self.assertEqual(self.staff.full_name, 'Sarah Wilson')

    def test_role_and_password_cannot_be_changed_here(self):
        self.patch({'role': 'admin', 'password': 'Hacked-Pass-2026!', 'is_superuser': True, 'is_staff': True})
        self.staff.refresh_from_db()
        self.assertEqual(self.staff.role, Role.STAFF)
        self.assertTrue(self.staff.check_password(STAFF_PASSWORD))
        self.assertFalse(self.staff.is_superuser)

    def test_only_changed_columns_are_written(self):
        with CaptureQueriesContext(connection) as queries:
            self.patch({'full_name': 'Sarah New'})
        updates = [q['sql'] for q in queries if q['sql'].startswith('UPDATE')]
        self.assertEqual(len(updates), 1)
        self.assertNotIn('password', updates[0])

    # ---- activate / deactivate ----
    def test_deactivating_blocks_login_and_existing_tokens_at_once(self):
        client, tokens = self.staff_client()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {tokens["access"]}')
        self.assertEqual(client.get(reverse('authentication:me')).status_code, 200)

        response = self.patch({'is_active': False})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['is_active'])

        self.assertEqual(client.get(reverse('authentication:me')).status_code, 401)  # access token stops working
        refresh = client.post(reverse('authentication:token-refresh'), {'refresh': tokens['refresh']}, format='json')
        self.assertEqual(refresh.status_code, 401)  # refresh token too
        login = APIClient().post(reverse('authentication:login'), {'email': 'sarah@bookhero.com', 'password': STAFF_PASSWORD}, format='json')
        self.assertEqual(login.status_code, 401)  # and a new sign-in

    def test_reactivating_lets_them_sign_in_again(self):
        self.patch({'is_active': False})
        response = self.patch({'is_active': True})
        self.assertTrue(response.data['is_active'])
        _, tokens = self.staff_client()
        self.assertIn('access', tokens)

    # ---- delete ----
    def test_delete_removes_the_account_and_its_access(self):
        client, tokens = self.staff_client()
        response = self.client.delete(self.url)
        self.assertEqual(response.status_code, 204)
        self.assertFalse(User.objects.filter(pk=self.staff.pk).exists())
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {tokens["access"]}')
        self.assertEqual(client.get(reverse('authentication:me')).status_code, 401)
        refresh = client.post(reverse('authentication:token-refresh'), {'refresh': tokens['refresh']}, format='json')
        self.assertIn(refresh.status_code, (400, 401))  # must not be a 500
        login = APIClient().post(reverse('authentication:login'), {'email': 'sarah@bookhero.com', 'password': STAFF_PASSWORD}, format='json')
        self.assertEqual(login.status_code, 401)
        self.assertEqual(self.client.delete(self.url).status_code, 404)  # already gone

    def test_deleting_a_staff_member_frees_the_email(self):
        self.client.delete(self.url)
        response = self.client.post(
            reverse('authentication:staff-create'),
            {'full_name': 'Sarah Again', 'phone_number': '+919876543210', 'email': 'sarah@bookhero.com', 'password': STAFF_PASSWORD, 'confirm_password': STAFF_PASSWORD},
            format='json',
        )
        self.assertEqual(response.status_code, 201)

    # ---- who may do this ----
    def test_admin_accounts_cannot_be_edited_or_deleted_here(self):
        admin_url = reverse('authentication:staff-detail', args=[self.admin.pk])
        self.assertEqual(self.patch({'is_active': False}, admin_url).status_code, 404)
        self.assertEqual(self.client.delete(admin_url).status_code, 404)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.is_active)

    def test_unknown_id_is_404(self):
        url = reverse('authentication:staff-detail', args=[999999])
        self.assertEqual(self.patch({'full_name': 'x'}, url).status_code, 404)
        self.assertEqual(self.client.delete(url).status_code, 404)

    def test_only_the_admin_may_use_it(self):
        client, tokens = self.staff_client()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {tokens["access"]}')
        self.assertEqual(client.patch(self.url, {'full_name': 'Mine'}, format='json').status_code, 403)
        self.assertEqual(client.delete(self.url).status_code, 403)
        anonymous = APIClient()
        self.assertEqual(anonymous.patch(self.url, {'full_name': 'x'}, format='json').status_code, 401)
        self.assertEqual(anonymous.delete(self.url).status_code, 401)
        self.assertTrue(User.objects.filter(pk=self.staff.pk, full_name='Sarah Wilson').exists())

    def test_get_and_put_are_not_allowed(self):
        self.assertEqual(self.client.get(self.url).status_code, 405)
        self.assertEqual(self.client.put(self.url, {'full_name': 'x'}, format='json').status_code, 405)
