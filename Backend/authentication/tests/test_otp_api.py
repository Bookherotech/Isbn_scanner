from django.core import mail
from django.core.cache import cache
from django.urls import reverse
from rest_framework.test import APITestCase

from authentication.constants import OTP_MAX_ATTEMPTS, Role
from authentication.models import LoginOTP, User
from authentication.tests.helpers import latest_code

PASSWORD = 'pass-12345-xyz'


class SuperAdminOtpLoginTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_superuser('rachel@bookhero.com', PASSWORD, full_name='Rachel Morgan')
        self.staff = User.objects.create_user('sarah@bookhero.com', PASSWORD)
        self.login_url = reverse('authentication:login')
        self.verify_url = reverse('authentication:verify-otp')
        self.resend_url = reverse('authentication:resend-otp')

    def login(self, email='rachel@bookhero.com', password=PASSWORD):
        return self.client.post(self.login_url, {'email': email, 'password': password}, format='json')

    def verify(self, challenge, otp):
        return self.client.post(self.verify_url, {'challenge': challenge, 'otp': otp}, format='json')

    def test_super_admin_password_login_asks_for_a_code_and_gives_no_tokens(self):
        response = self.login()
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['otp_required'])
        self.assertEqual(response.data['email_hint'], 'r*****@bookhero.com')
        self.assertEqual(response.data['expires_in'], 300)
        self.assertNotIn('access', response.data)
        self.assertNotIn('refresh', response.data)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['rachel@bookhero.com'])

    def test_staff_login_is_unchanged_and_sends_no_email(self):
        response = self.login('sarah@bookhero.com')
        self.assertEqual(response.status_code, 200)
        self.assertEqual({'access', 'refresh', 'user'}, set(response.data))
        self.assertEqual(len(mail.outbox), 0)
        self.assertFalse(LoginOTP.objects.exists())

    def test_wrong_password_sends_no_code(self):
        self.assertEqual(self.login(password='nope').status_code, 401)
        self.assertEqual(len(mail.outbox), 0)

    def test_correct_code_completes_the_login(self):
        challenge = self.login().data['challenge']
        response = self.verify(challenge, latest_code())
        self.assertEqual(response.status_code, 200)
        self.assertEqual({'access', 'refresh', 'user'}, set(response.data))
        self.assertEqual(response.data['user']['role'], Role.ADMIN)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {response.data["access"]}')
        self.assertEqual(self.client.get(reverse('authentication:me')).data['email'], 'rachel@bookhero.com')

    def test_last_login_is_only_set_after_the_code(self):
        challenge = self.login().data['challenge']
        self.admin.refresh_from_db()
        self.assertIsNone(self.admin.last_login)
        self.verify(challenge, latest_code())
        self.admin.refresh_from_db()
        self.assertIsNotNone(self.admin.last_login)

    def test_wrong_code_then_lockout(self):
        challenge = self.login().data['challenge']
        code = latest_code()
        wrong = '0000' if code != '0000' else '1111'
        response = self.verify(challenge, wrong)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'otp_incorrect')
        self.assertEqual(response.data['attempts_left'], OTP_MAX_ATTEMPTS - 1)
        for _ in range(OTP_MAX_ATTEMPTS - 1):
            self.verify(challenge, wrong)
        locked = self.verify(challenge, code)
        self.assertEqual(locked.status_code, 400)
        self.assertEqual(locked.data['code'], 'otp_locked')

    def test_malformed_code_is_a_validation_error(self):
        challenge = self.login().data['challenge']
        for bad in ['12', '12345', 'abcd', '12 4', '']:
            response = self.verify(challenge, bad)
            self.assertEqual(response.status_code, 400, bad)
        self.assertEqual(LoginOTP.objects.get().attempts, 0)  # bad format does not burn an attempt

    def test_unknown_challenge_is_rejected(self):
        response = self.verify('made-up', '1234')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'otp_invalid_challenge')

    def test_resend_sends_another_email(self):
        challenge = self.login().data['challenge']
        early = self.client.post(self.resend_url, {'challenge': challenge}, format='json')
        self.assertEqual(early.status_code, 429)
        self.assertEqual(early.data['code'], 'otp_resend_cooldown')
        self.assertGreater(early.data['retry_after'], 0)

    def test_verify_endpoint_is_throttled_per_ip(self):
        challenge = self.login().data['challenge']
        statuses = [self.verify(challenge, 'abcd').status_code for _ in range(11)]
        self.assertEqual(statuses[:10], [400] * 10)
        self.assertEqual(statuses[10], 429)

    def test_login_is_throttled_before_any_email_flood(self):
        for _ in range(10):
            self.login()
        self.assertEqual(self.login().status_code, 429)
        self.assertLessEqual(len(mail.outbox), 10)
