from datetime import timedelta
from unittest import mock

from django.core import mail, signing
from django.core.cache import cache
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from authentication.constants import OTP_MAX_ATTEMPTS, OTP_RESEND_COOLDOWN_SECONDS
from authentication.models import ActionOTP, User
from authentication.services.password_reset_token import SALT
from authentication.tests.helpers import latest_code

OLD_PASSWORD = 'Sturdy-Pass-2026!'
NEW_PASSWORD = 'Brand-New-Pass-2027!'
ADMIN_PASSWORD = 'pass-12345-xyz'


class PasswordResetApiTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.staff = User.objects.create_user('sarah@bookhero.com', OLD_PASSWORD, full_name='Sarah Wilson')
        self.admin = User.objects.create_superuser('admin@bookhero.com', ADMIN_PASSWORD, full_name='Rachel Morgan')
        self.client = APIClient()  # nobody is signed in: this is "forgot password"

    def request_code(self, email='sarah@bookhero.com'):
        return self.client.post(reverse('authentication:password-reset'), {'email': email}, format='json')

    def verify(self, challenge, otp):
        return self.client.post(reverse('authentication:password-reset-verify'), {'challenge': challenge, 'otp': otp}, format='json')

    def confirm(self, token, password=NEW_PASSWORD, confirm=None):
        return self.client.post(
            reverse('authentication:password-reset-confirm'),
            {'reset_token': token, 'password': password, 'confirm_password': password if confirm is None else confirm},
            format='json',
        )

    def get_ticket(self, email='sarah@bookhero.com'):
        challenge = self.request_code(email).data['challenge']
        return self.verify(challenge, latest_code()).data['reset_token']

    def login_status(self, email, password):
        return APIClient().post(reverse('authentication:login'), {'email': email, 'password': password}, format='json').status_code

    # ---- step 1: ask for a code ----
    def test_a_code_is_emailed_to_the_account(self):
        response = self.request_code('Sarah@BookHero.com')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['email_hint'], 's****@bookhero.com')
        self.assertEqual(response.data['expires_in'], 300)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['sarah@bookhero.com'])
        self.assertEqual(mail.outbox[0].subject, 'Reset your password - BookHero')
        self.assertIn('reset your BookHero password', mail.outbox[0].body)

    def test_an_unknown_email_is_told_there_is_no_account_and_nothing_is_sent(self):
        response = self.request_code('ghost@bookhero.com')
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data['code'], 'no_account')
        self.assertEqual(response.data['detail'], 'No account found with this email.')
        self.assertEqual(len(mail.outbox), 0)
        self.assertFalse(ActionOTP.objects.exists())

    def test_a_deactivated_account_cannot_reset(self):
        User.objects.filter(pk=self.staff.pk).update(is_active=False)
        response = self.request_code()
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data['code'], 'account_inactive')
        self.assertEqual(len(mail.outbox), 0)

    def test_an_invalid_email_is_a_validation_error(self):
        self.assertEqual(self.request_code('not-an-email').status_code, 400)
        self.assertEqual(self.client.post(reverse('authentication:password-reset'), {}, format='json').status_code, 400)

    def test_the_super_admin_can_reset_too(self):
        response = self.request_code('admin@bookhero.com')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(mail.outbox[0].to, ['admin@bookhero.com'])

    def test_asking_again_too_soon_is_a_cooldown_not_an_email_flood(self):
        self.assertEqual(self.request_code().status_code, 200)
        response = self.request_code()
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.data['code'], 'otp_resend_cooldown')
        self.assertEqual(len(mail.outbox), 1)

    def test_asking_again_after_the_cooldown_replaces_the_old_code(self):
        first = self.request_code().data['challenge']
        first_code = latest_code()
        ActionOTP.objects.update(last_sent_at=timezone.now() - timedelta(seconds=OTP_RESEND_COOLDOWN_SECONDS + 1))
        second = self.request_code().data['challenge']
        self.assertEqual(ActionOTP.objects.filter(purpose=ActionOTP.Purpose.PASSWORD_RESET).count(), 1)
        self.assertEqual(self.verify(first, first_code).status_code, 400)  # the old one is gone
        self.assertEqual(self.verify(second, latest_code()).status_code, 200)

    def test_the_request_is_throttled_per_ip(self):
        statuses = [self.request_code(f'ghost{i}@bookhero.com').status_code for i in range(6)]
        self.assertEqual(statuses[:5], [404] * 5)
        self.assertEqual(statuses[5], 429)

    def test_a_failed_email_leaves_nothing_behind(self):
        with mock.patch('authentication.services.action_otp_service.send_action_otp_email', side_effect=OSError('smtp down')):
            response = self.request_code()
        self.assertEqual(response.status_code, 503)
        self.assertFalse(ActionOTP.objects.exists())

    # ---- step 2: the code ----
    def test_the_right_code_gives_a_ticket(self):
        challenge = self.request_code().data['challenge']
        response = self.verify(challenge, latest_code())
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['reset_token'])

    def test_wrong_codes_count_down_and_then_lock(self):
        challenge = self.request_code().data['challenge']
        code = latest_code()
        wrong = '0000' if code != '0000' else '1111'
        first = self.verify(challenge, wrong)
        self.assertEqual(first.status_code, 400)
        self.assertEqual(first.data['code'], 'otp_incorrect')
        self.assertEqual(first.data['attempts_left'], OTP_MAX_ATTEMPTS - 1)
        for _ in range(OTP_MAX_ATTEMPTS - 1):
            self.verify(challenge, wrong)
        self.assertEqual(self.verify(challenge, code).data['code'], 'otp_locked')

    def test_the_code_works_once_and_not_after_it_expires(self):
        challenge = self.request_code().data['challenge']
        code = latest_code()
        self.assertEqual(self.verify(challenge, code).status_code, 200)
        self.assertEqual(self.verify(challenge, code).status_code, 400)
        ActionOTP.objects.update(used_at=None, expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.verify(challenge, code).data['code'], 'otp_expired')

    def test_an_unknown_challenge_is_rejected(self):
        response = self.verify('made-up', '1234')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'otp_invalid_challenge')

    def test_other_kinds_of_codes_cannot_be_used_here(self):
        # an admin's email-change code must not work as a password-reset code
        row = ActionOTP.objects.create(
            purpose=ActionOTP.Purpose.EMAIL_CHANGE, actor=self.admin, subject=self.staff, challenge_hash='x' * 64,
            code_hash='y' * 64, expires_at=timezone.now() + timedelta(minutes=5),
        )
        self.assertEqual(self.verify('x', '1234').status_code, 400)
        row.refresh_from_db()
        self.assertEqual(row.attempts, 0)

    def test_the_code_check_is_throttled_per_ip(self):
        challenge = self.request_code().data['challenge']
        statuses = [self.verify(challenge, 'abcd').status_code for _ in range(11)]
        self.assertEqual(statuses[:10], [400] * 10)
        self.assertEqual(statuses[10], 429)

    # ---- step 3: the new password ----
    def test_full_flow_changes_the_password(self):
        token = self.get_ticket()
        response = self.confirm(token)
        self.assertEqual(response.status_code, 200)
        self.staff.refresh_from_db()
        self.assertNotEqual(self.staff.password, NEW_PASSWORD)  # stored hashed
        self.assertTrue(self.staff.check_password(NEW_PASSWORD))
        self.assertEqual(self.login_status('sarah@bookhero.com', NEW_PASSWORD), 200)
        self.assertEqual(self.login_status('sarah@bookhero.com', OLD_PASSWORD), 401)

    def test_the_ticket_works_only_once(self):
        token = self.get_ticket()
        self.assertEqual(self.confirm(token).status_code, 200)
        again = self.confirm(token, 'Another-New-Pass-2027!')
        self.assertEqual(again.status_code, 400)
        self.assertEqual(again.data['code'], 'reset_token_invalid')
        self.staff.refresh_from_db()
        self.assertTrue(self.staff.check_password(NEW_PASSWORD))

    def test_a_forged_or_expired_ticket_is_rejected(self):
        self.assertEqual(self.confirm('not-a-ticket').data['code'], 'reset_token_invalid')
        other_salt = signing.dumps({'uid': self.staff.pk, 'pw': self.staff.get_session_auth_hash()}, salt='something.else')
        self.assertEqual(self.confirm(other_salt).data['code'], 'reset_token_invalid')
        with mock.patch('authentication.services.password_reset_token.MAX_AGE_SECONDS', -1):
            self.assertEqual(self.confirm(self.get_ticket()).data['code'], 'reset_token_invalid')
        self.staff.refresh_from_db()
        self.assertTrue(self.staff.check_password(OLD_PASSWORD))

    def test_a_ticket_for_a_deactivated_account_is_rejected(self):
        token = self.get_ticket()
        User.objects.filter(pk=self.staff.pk).update(is_active=False)
        self.assertEqual(self.confirm(token).data['code'], 'reset_token_invalid')

    def test_passwords_must_match_and_be_strong(self):
        token = self.get_ticket()
        mismatch = self.confirm(token, confirm='Different-Pass-2027!')
        self.assertEqual(mismatch.status_code, 400)
        self.assertIn('confirm_password', mismatch.data)
        for weak in ['12345678', 'short1!', 'password', 'sarah@bookhero.com', 'sarahwilson']:
            response = self.confirm(token, weak)
            self.assertEqual(response.status_code, 400, weak)
            self.assertIn('password', response.data, weak)
        self.assertEqual(self.confirm(token).status_code, 200)  # the ticket survived the failed tries
        self.staff.refresh_from_db()
        self.assertTrue(self.staff.check_password(NEW_PASSWORD))

    def test_old_sessions_stop_working_after_a_reset(self):
        client = APIClient()
        login = client.post(reverse('authentication:login'), {'email': 'sarah@bookhero.com', 'password': OLD_PASSWORD}, format='json').data
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {login["access"]}')
        self.assertEqual(client.get(reverse('authentication:me')).status_code, 200)
        self.confirm(self.get_ticket())
        self.assertEqual(client.get(reverse('authentication:me')).status_code, 401)

    def test_resetting_one_account_does_not_touch_another(self):
        self.confirm(self.get_ticket())
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.check_password(ADMIN_PASSWORD))

    def test_every_field_is_required(self):
        response = self.client.post(reverse('authentication:password-reset-confirm'), {}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(set(response.data), {'reset_token', 'password', 'confirm_password'})
