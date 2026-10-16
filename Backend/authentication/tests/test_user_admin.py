from django.test import TestCase
from django.urls import reverse

from authentication.models import User

PASSWORD = 'pass-12345-xyz'


class UserAdminTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser('admin@bookhero.com', PASSWORD)
        self.client.force_login(self.admin)

    def test_changelist_and_add_pages_load(self):
        self.assertEqual(self.client.get(reverse('admin:authentication_user_changelist')).status_code, 200)
        self.assertEqual(self.client.get(reverse('admin:authentication_user_add')).status_code, 200)

    def test_change_page_loads(self):
        url = reverse('admin:authentication_user_change', args=[self.admin.pk])
        self.assertEqual(self.client.get(url).status_code, 200)

    def test_admin_can_add_a_staff_user_with_email_and_password(self):
        response = self.client.post(
            reverse('admin:authentication_user_add'),
            {
                'email': 'New.Staff@BookHero.com',
                'full_name': 'New Staff',
                'role': 'staff',
                'password1': PASSWORD,
                'password2': PASSWORD,
            },
        )
        self.assertEqual(response.status_code, 302)
        user = User.objects.get(email='new.staff@bookhero.com')
        self.assertTrue(user.check_password(PASSWORD))
