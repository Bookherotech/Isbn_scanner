from django.core import mail
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.db import connection
from django.test import SimpleTestCase
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from rest_framework.test import APITestCase

from authentication.constants import Role
from authentication.models import User
from authentication.tests.helpers import sign_in
from authentication.validators import clean_phone_number, validate_phone_number

PASSWORD = 'pass-12345-xyz'
STAFF_PASSWORD = 'Sturdy-Pass-2026!'


def payload(**overrides):
    return {
        'full_name': 'Priya Shah',
        'phone_number': '+919876543210',
        'email': 'priya@bookhero.com',
        'password': STAFF_PASSWORD,
        'confirm_password': STAFF_PASSWORD,
        **overrides,
    }


class PhoneNumberValidatorTests(SimpleTestCase):
    def test_accepts_international_numbers(self):
        for number in ['+919876543210', '+14155552671', '+442071838750', '+97150123456']:
            validate_phone_number(number)

    def test_rejects_numbers_without_a_country_code_or_wrong_length(self):
        for number in ['9876543210', '09876543210', '+0123456789', '+12345', '+1234567890123456', '+91 98765 43210', '+91abc', '']:
            with self.assertRaises(ValidationError, msg=number):
                validate_phone_number(number)

    def test_clean_drops_separators(self):
        self.assertEqual(clean_phone_number('+91 (98765) 43-210'), '+919876543210')
        self.assertEqual(clean_phone_number('+91.98765.43210'), '+919876543210')


class StaffCreateApiTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.url = reverse('authentication:staff-create')
        self.admin = User.objects.create_superuser('admin@bookhero.com', PASSWORD)
        self.as_admin()

    def as_admin(self):
        tokens = sign_in(self.client, 'admin@bookhero.com', PASSWORD).data  # includes the OTP step
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {tokens["access"]}')

    def post(self, **overrides):
        return self.client.post(self.url, payload(**overrides), format='json')

    def test_admin_creates_a_staff_user(self):
        response = self.post(email='Priya@BookHero.com ', phone_number='+91 98765-43210')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['email'], 'priya@bookhero.com')
        self.assertEqual(response.data['phone_number'], '+919876543210')
        self.assertEqual(response.data['role'], Role.STAFF)
        self.assertNotIn('password', response.data)
        user = User.objects.get(email='priya@bookhero.com')
        self.assertEqual(user.full_name, 'Priya Shah')
        self.assertTrue(user.is_active)
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertNotEqual(user.password, STAFF_PASSWORD)  # stored hashed
        self.assertTrue(user.check_password(STAFF_PASSWORD))

    def test_new_staff_signs_in_with_email_and_password_and_no_otp(self):
        self.post()
        mail.outbox.clear()
        self.client.credentials()
        response = self.client.post(reverse('authentication:login'), {'email': 'priya@bookhero.com', 'password': STAFF_PASSWORD}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual({'access', 'refresh', 'user'}, set(response.data))
        self.assertNotIn('otp_required', response.data)
        self.assertEqual(response.data['user']['role'], Role.STAFF)
        self.assertEqual(len(mail.outbox), 0)  # no code was emailed

    def test_only_the_admin_can_create_staff(self):
        self.client.credentials()
        self.assertEqual(self.client.post(self.url, payload(), format='json').status_code, 401)
        self.as_admin()
        self.assertEqual(self.post().status_code, 201)
        staff_tokens = sign_in(self.client, 'priya@bookhero.com', STAFF_PASSWORD).data
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {staff_tokens["access"]}')
        response = self.post(email='another@bookhero.com')
        self.assertEqual(response.status_code, 403)
        self.assertFalse(User.objects.filter(email='another@bookhero.com').exists())

    def test_duplicate_email_is_rejected_ignoring_case(self):
        self.assertEqual(self.post().status_code, 201)
        response = self.post(email='PRIYA@bookhero.com')
        self.assertEqual(response.status_code, 400)
        self.assertIn('email', response.data)
        self.assertEqual(User.objects.filter(email='priya@bookhero.com').count(), 1)

    def test_passwords_must_match(self):
        response = self.post(confirm_password='Different-Pass-2026!')
        self.assertEqual(response.status_code, 400)
        self.assertIn('confirm_password', response.data)
        self.assertFalse(User.objects.filter(email='priya@bookhero.com').exists())

    def test_weak_passwords_are_rejected(self):
        for weak in ['12345678', 'short1!', 'password', 'priya@bookhero.com']:
            response = self.post(password=weak, confirm_password=weak)
            self.assertEqual(response.status_code, 400, weak)
            self.assertIn('password', response.data, weak)
        self.assertFalse(User.objects.filter(email='priya@bookhero.com').exists())

    def test_phone_needs_a_country_code(self):
        for bad in ['9876543210', '+12', 'not-a-number']:
            response = self.post(phone_number=bad)
            self.assertEqual(response.status_code, 400, bad)
            self.assertIn('phone_number', response.data, bad)

    def test_every_field_is_required(self):
        response = self.client.post(self.url, {}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(set(response.data), {'full_name', 'phone_number', 'email', 'password', 'confirm_password'})

    def test_invalid_email_is_rejected(self):
        self.assertEqual(self.post(email='not-an-email').status_code, 400)

    def test_created_staff_appear_in_the_admin_user_list_with_their_phone(self):
        self.post()
        response = self.client.get(reverse('authentication:user-list'), {'role': 'staff'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual([(row['email'], row['phone_number']) for row in response.data['results']], [('priya@bookhero.com', '+919876543210')])

    def test_creating_staff_uses_few_queries(self):
        with CaptureQueriesContext(connection) as queries:
            self.assertEqual(self.post().status_code, 201)
        self.assertLessEqual(len(queries), 6)  # JWT user, email check, insert (+ transaction bookkeeping)
