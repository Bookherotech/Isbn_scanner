from django.core.cache import cache
from django.urls import reverse
from rest_framework.test import APIClient, APITestCase

from authentication.models import User
from authentication.tests.helpers import sign_in

PASSWORD = 'pass-12345-xyz'
OLD_PASSWORD = 'Sturdy-Pass-2026!'
NEW_PASSWORD = 'Brand-New-Pass-2027!'


class StaffPasswordApiTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_superuser('admin@bookhero.com', PASSWORD)
        self.staff = User.objects.create_user('sarah@bookhero.com', OLD_PASSWORD, full_name='Sarah Wilson')
        self.url = reverse('authentication:staff-password', args=[self.staff.pk])
        tokens = sign_in(self.client, 'admin@bookhero.com', PASSWORD).data
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {tokens["access"]}')

    def post(self, password=NEW_PASSWORD, confirm=None, url=None):
        return self.client.post(url or self.url, {'password': password, 'confirm_password': password if confirm is None else confirm}, format='json')

    def staff_login(self, password):
        client = APIClient()
        response = client.post(reverse('authentication:login'), {'email': 'sarah@bookhero.com', 'password': password}, format='json')
        return client, response

    def test_admin_sets_a_new_password(self):
        response = self.post()
        self.assertEqual(response.status_code, 200)
        self.staff.refresh_from_db()
        self.assertNotEqual(self.staff.password, NEW_PASSWORD)  # stored hashed
        self.assertTrue(self.staff.check_password(NEW_PASSWORD))
        self.assertEqual(self.staff_login(NEW_PASSWORD)[1].status_code, 200)
        self.assertEqual(self.staff_login(OLD_PASSWORD)[1].status_code, 401)

    def test_the_staff_members_old_sessions_stop_working(self):
        client, login = self.staff_login(OLD_PASSWORD)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {login.data["access"]}')
        self.assertEqual(client.get(reverse('authentication:me')).status_code, 200)

        self.post()

        self.assertEqual(client.get(reverse('authentication:me')).status_code, 401)  # the old access token
        refreshed = client.post(reverse('authentication:token-refresh'), {'refresh': login.data['refresh']}, format='json')
        if refreshed.status_code == 200:  # a refresh may still hand out a token, but it must be useless
            client.credentials(HTTP_AUTHORIZATION=f'Bearer {refreshed.data["access"]}')
            self.assertEqual(client.get(reverse('authentication:me')).status_code, 401)

    def test_the_new_password_gives_working_sessions(self):
        self.post()
        client, login = self.staff_login(NEW_PASSWORD)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {login.data["access"]}')
        self.assertEqual(client.get(reverse('authentication:me')).status_code, 200)

    def test_the_admins_own_session_is_not_affected(self):
        self.post()
        self.assertEqual(self.client.get(reverse('authentication:me')).status_code, 200)

    def test_passwords_must_match(self):
        response = self.post(confirm='Different-Pass-2027!')
        self.assertEqual(response.status_code, 400)
        self.assertIn('confirm_password', response.data)
        self.staff.refresh_from_db()
        self.assertTrue(self.staff.check_password(OLD_PASSWORD))

    def test_weak_passwords_are_rejected(self):
        for weak in ['12345678', 'short1!', 'password', 'sarah@bookhero.com', 'sarahwilson']:
            response = self.post(weak)
            self.assertEqual(response.status_code, 400, weak)
            self.assertIn('password', response.data, weak)
        self.staff.refresh_from_db()
        self.assertTrue(self.staff.check_password(OLD_PASSWORD))

    def test_both_fields_are_required(self):
        response = self.client.post(self.url, {}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(set(response.data), {'password', 'confirm_password'})

    def test_only_the_admin_can_do_it_and_only_for_staff(self):
        client, login = self.staff_login(OLD_PASSWORD)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {login.data["access"]}')
        self.assertEqual(client.post(self.url, {'password': NEW_PASSWORD, 'confirm_password': NEW_PASSWORD}, format='json').status_code, 403)
        self.assertEqual(APIClient().post(self.url, {'password': NEW_PASSWORD, 'confirm_password': NEW_PASSWORD}, format='json').status_code, 401)
        self.assertEqual(self.post(url=reverse('authentication:staff-password', args=[self.admin.pk])).status_code, 404)  # an admin account
        self.assertEqual(self.post(url=reverse('authentication:staff-password', args=[999999])).status_code, 404)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.check_password(PASSWORD))
