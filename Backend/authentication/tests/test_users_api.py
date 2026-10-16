from django.core.cache import cache
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from rest_framework.test import APITestCase

from authentication.constants import Role
from authentication.models import User
from authentication.tests.helpers import sign_in

PASSWORD = 'pass-12345-xyz'


class UserListApiTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.url = reverse('authentication:user-list')
        self.admin = User.objects.create_superuser('admin@bookhero.com', PASSWORD)
        self.staff = User.objects.create_user('staff@bookhero.com', PASSWORD)

    def as_user(self, email):
        tokens = sign_in(self.client, email, PASSWORD).data  # a Super Admin also passes the OTP step
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {tokens["access"]}')

    def test_anonymous_is_401_and_staff_is_403(self):
        self.assertEqual(self.client.get(self.url).status_code, 401)
        self.as_user('staff@bookhero.com')
        self.assertEqual(self.client.get(self.url).status_code, 403)

    def test_admin_lists_users_newest_first_without_passwords(self):
        self.as_user('admin@bookhero.com')
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        emails = [row['email'] for row in response.data['results']]
        self.assertEqual(emails, ['staff@bookhero.com', 'admin@bookhero.com'])
        self.assertNotIn('password', response.data['results'][0])

    def test_filters(self):
        User.objects.create_user('inactive@bookhero.com', PASSWORD, is_active=False)
        self.as_user('admin@bookhero.com')

        def emails(query):
            return {row['email'] for row in self.client.get(self.url, query).data['results']}

        self.assertEqual(emails({'role': 'admin'}), {'admin@bookhero.com'})
        self.assertEqual(emails({'role': 'staff', 'is_active': 'false'}), {'inactive@bookhero.com'})
        self.assertEqual(emails({'q': 'STA'}), {'staff@bookhero.com'})

    def test_invalid_filter_values_are_400(self):
        self.as_user('admin@bookhero.com')
        self.assertEqual(self.client.get(self.url, {'role': 'boss'}).status_code, 400)
        self.assertEqual(self.client.get(self.url, {'is_active': 'maybe'}).status_code, 400)

    def test_cursor_pagination_walks_every_user_once(self):
        User.objects.bulk_create([User(email=f'user{i}@bookhero.com', role=Role.STAFF) for i in range(5)])
        self.as_user('admin@bookhero.com')
        seen, response = [], self.client.get(self.url, {'page_size': 3})
        while True:
            seen += [row['email'] for row in response.data['results']]
            if not response.data['next']:
                break
            response = self.client.get(response.data['next'])
        self.assertEqual(len(seen), 7)
        self.assertEqual(len(set(seen)), 7)

    def test_no_n_plus_one_query_count_does_not_grow_with_rows(self):
        self.as_user('admin@bookhero.com')

        def count_queries():
            with CaptureQueriesContext(connection) as queries:
                self.assertEqual(self.client.get(self.url, {'page_size': 100}).status_code, 200)
            return len(queries)

        few = count_queries()
        User.objects.bulk_create([User(email=f'bulk{i}@bookhero.com', role=Role.STAFF) for i in range(60)])
        many = count_queries()
        self.assertEqual(few, many)
        self.assertLessEqual(many, 2)  # JWT user lookup + one page query
