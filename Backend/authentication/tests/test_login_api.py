from django.core.cache import cache
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from authentication.constants import Role
from authentication.models import User

PASSWORD = 'pass-12345-xyz'


class LoginApiTests(APITestCase):
    def setUp(self):
        cache.clear()  # the login throttle counts requests in the cache
        self.login_url = reverse('authentication:login')
        self.user = User.objects.create_user('staff@bookhero.com', PASSWORD, full_name='Sarah Lee')

    def login(self, email, password):
        return self.client.post(self.login_url, {'email': email, 'password': password}, format='json')

    def test_login_returns_tokens_and_user(self):
        response = self.login('staff@bookhero.com', PASSWORD)
        self.assertEqual(response.status_code, 200)
        self.assertEqual({'access', 'refresh', 'user'}, set(response.data))
        self.assertEqual(response.data['user']['email'], 'staff@bookhero.com')
        self.assertEqual(response.data['user']['role'], Role.STAFF)
        self.assertNotIn('password', response.data['user'])
        self.assertEqual(AccessToken(response.data['access'])['role'], Role.STAFF)

    def test_login_updates_last_login(self):
        self.login('staff@bookhero.com', PASSWORD)
        self.user.refresh_from_db()
        self.assertIsNotNone(self.user.last_login)

    def test_email_is_case_insensitive(self):
        self.assertEqual(self.login('STAFF@BookHero.com', PASSWORD).status_code, 200)

    def test_wrong_password_and_unknown_email_look_the_same(self):
        wrong = self.login('staff@bookhero.com', 'nope')
        unknown = self.login('ghost@bookhero.com', PASSWORD)
        self.assertEqual(wrong.status_code, 401)
        self.assertEqual(unknown.status_code, 401)
        self.assertEqual(wrong.data, unknown.data)  # no user enumeration

    def test_inactive_user_cannot_login(self):
        User.objects.filter(pk=self.user.pk).update(is_active=False)
        self.assertEqual(self.login('staff@bookhero.com', PASSWORD).status_code, 401)

    def test_missing_fields_is_400(self):
        response = self.client.post(self.login_url, {}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('email', response.data)
        self.assertIn('password', response.data)

    def test_login_is_throttled(self):
        for _ in range(10):
            self.login('staff@bookhero.com', 'wrong')
        self.assertEqual(self.login('staff@bookhero.com', PASSWORD).status_code, 429)

    def test_login_uses_few_queries(self):
        with CaptureQueriesContext(connection) as queries:
            self.login('staff@bookhero.com', PASSWORD)
        self.assertLessEqual(len(queries), 2)  # user lookup + last_login update


class TokenAndMeApiTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user('staff@bookhero.com', PASSWORD)
        self.tokens = self.client.post(
            reverse('authentication:login'), {'email': 'staff@bookhero.com', 'password': PASSWORD}, format='json'
        ).data

    def test_me_requires_authentication(self):
        self.assertEqual(self.client.get(reverse('authentication:me')).status_code, 401)

    def test_me_returns_current_user_with_one_query(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.tokens["access"]}')
        with CaptureQueriesContext(connection) as queries:
            response = self.client.get(reverse('authentication:me'))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['email'], 'staff@bookhero.com')
        self.assertEqual(len(queries), 1)  # only the JWT user lookup

    def test_refresh_returns_new_access_token(self):
        response = self.client.post(
            reverse('authentication:token-refresh'), {'refresh': self.tokens['refresh']}, format='json'
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn('access', response.data)

    def test_invalid_token_is_rejected(self):
        self.client.credentials(HTTP_AUTHORIZATION='Bearer not-a-token')
        self.assertEqual(self.client.get(reverse('authentication:me')).status_code, 401)

    def test_deactivated_user_token_stops_working(self):
        User.objects.filter(pk=self.user.pk).update(is_active=False)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.tokens["access"]}')
        self.assertEqual(self.client.get(reverse('authentication:me')).status_code, 401)
