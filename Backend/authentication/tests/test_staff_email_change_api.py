from datetime import timedelta
from unittest import mock

from django.core import mail
from django.core.cache import cache
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from authentication.constants import OTP_MAX_ATTEMPTS, OTP_RESEND_COOLDOWN_SECONDS
from authentication.exceptions import OtpDeliveryError
from authentication.models import ActionOTP, User
from authentication.tests.helpers import latest_code, sign_in

PASSWORD = 'pass-12345-xyz'
STAFF_PASSWORD = 'Sturdy-Pass-2026!'


class StaffEmailChangeApiTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_superuser('admin@bookhero.com', PASSWORD, full_name='Rachel Morgan')
        self.staff = User.objects.create_user('sarah@bookhero.com', STAFF_PASSWORD, full_name='Sarah Wilson')
        self.other = User.objects.create_user('other@bookhero.com', STAFF_PASSWORD, full_name='Other Person')
        tokens = sign_in(self.client, 'admin@bookhero.com', PASSWORD).data
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {tokens["access"]}')
        mail.outbox.clear()

    def url(self, name, staff=None):
        return reverse(f'authentication:{name}', args=[(staff or self.staff).pk])

    def start(self, new_email='sarah.new@bookhero.com', staff=None):
        return self.client.post(self.url('staff-email-change', staff), {'new_email': new_email}, format='json')

    def confirm(self, challenge, otp, staff=None):
        return self.client.post(self.url('staff-email-change-confirm', staff), {'challenge': challenge, 'otp': otp}, format='json')

    def verify(self, challenge, otp, staff=None):
        return self.client.post(self.url('staff-email-verification-confirm', staff), {'challenge': challenge, 'otp': otp}, format='json')

    def age_codes(self):
        ActionOTP.objects.update(last_sent_at=timezone.now() - timedelta(seconds=OTP_RESEND_COOLDOWN_SECONDS + 1))

    def full_flow(self):
        """Run both steps; returns (confirm response, verification challenge)."""
        challenge = self.start().data['challenge']
        confirm = self.confirm(challenge, latest_code())
        return confirm, confirm.data['verification']['challenge']

    # ---- step 1: ask for the admin's code ----
    def test_start_sends_the_code_to_the_admin_and_changes_nothing_yet(self):
        response = self.start()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['email_hint'], 'a****@bookhero.com')  # the ADMIN's address, masked
        self.assertEqual(response.data['new_email'], 'sarah.new@bookhero.com')
        self.assertEqual(response.data['expires_in'], 300)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['admin@bookhero.com'])
        self.assertIn('sarah.new@bookhero.com', mail.outbox[0].body)
        self.staff.refresh_from_db()
        self.assertEqual(self.staff.email, 'sarah@bookhero.com')
        self.assertTrue(self.staff.email_verified)

    def test_start_rejects_bad_emails(self):
        for email, expected in [('sarah@bookhero.com', 'already their email'), ('SARAH@bookhero.com', 'already their email'), ('OTHER@bookhero.com', 'already exists'), ('admin@bookhero.com', 'already exists'), ('nope', 'valid email')]:
            response = self.start(email)
            self.assertEqual(response.status_code, 400, email)
            self.assertIn(expected, str(response.data['new_email'][0]), email)
        self.assertEqual(len(mail.outbox), 0)

    def test_start_twice_quickly_is_a_cooldown_not_an_email_flood(self):
        self.assertEqual(self.start().status_code, 200)
        response = self.start()
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.data['code'], 'otp_resend_cooldown')
        self.assertEqual(len(mail.outbox), 1)

    def test_a_new_start_after_the_cooldown_replaces_the_old_code(self):
        first = self.start().data['challenge']
        first_code = latest_code()
        self.age_codes()
        second = self.start('another@bookhero.com').data['challenge']
        self.assertEqual(ActionOTP.objects.filter(subject=self.staff).count(), 1)
        self.assertEqual(self.confirm(first, first_code).status_code, 400)  # the old challenge is gone
        self.assertEqual(self.confirm(second, latest_code()).data['user']['email'], 'another@bookhero.com')

    # ---- step 2: the admin's code changes the email and a second code goes to the new address ----
    def test_correct_admin_code_changes_the_email_and_emails_the_new_address(self):
        response, verification_challenge = self.full_flow()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['user']['email'], 'sarah.new@bookhero.com')
        self.assertFalse(response.data['user']['email_verified'])
        self.assertEqual(response.data['verification']['email_hint'], 's********@bookhero.com')
        self.staff.refresh_from_db()
        self.assertEqual(self.staff.email, 'sarah.new@bookhero.com')
        self.assertFalse(self.staff.email_verified)
        self.assertEqual(len(mail.outbox), 2)
        self.assertEqual(mail.outbox[1].to, ['sarah.new@bookhero.com'])  # the second code goes to the NEW address
        self.assertEqual(mail.outbox[1].subject, 'Confirm your email - BookHero')
        self.assertTrue(verification_challenge)

    def test_wrong_admin_code_changes_nothing_and_locks_after_five_tries(self):
        challenge = self.start().data['challenge']
        code = latest_code()
        wrong = '0000' if code != '0000' else '1111'
        first = self.confirm(challenge, wrong)
        self.assertEqual(first.status_code, 400)
        self.assertEqual(first.data['code'], 'otp_incorrect')
        self.assertEqual(first.data['attempts_left'], OTP_MAX_ATTEMPTS - 1)
        for _ in range(OTP_MAX_ATTEMPTS - 1):
            self.confirm(challenge, wrong)
        self.assertEqual(self.confirm(challenge, code).data['code'], 'otp_locked')
        self.staff.refresh_from_db()
        self.assertEqual(self.staff.email, 'sarah@bookhero.com')

    def test_the_admin_code_works_once(self):
        challenge = self.start().data['challenge']
        code = latest_code()
        self.assertEqual(self.confirm(challenge, code).status_code, 200)
        self.assertEqual(self.confirm(challenge, code).status_code, 400)

    def test_a_code_cannot_be_used_for_another_staff_member(self):
        challenge = self.start().data['challenge']
        response = self.confirm(challenge, latest_code(), staff=self.other)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'otp_invalid_challenge')
        self.other.refresh_from_db()
        self.assertEqual(self.other.email, 'other@bookhero.com')

    def test_expired_admin_code_is_rejected(self):
        challenge = self.start().data['challenge']
        code = latest_code()
        ActionOTP.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.confirm(challenge, code).data['code'], 'otp_expired')

    def test_email_taken_between_the_steps_is_refused(self):
        challenge = self.start().data['challenge']
        code = latest_code()
        User.objects.create_user('sarah.new@bookhero.com', STAFF_PASSWORD)  # someone grabs it first
        response = self.confirm(challenge, code)
        self.assertEqual(response.status_code, 400)
        self.assertIn('new_email', response.data)
        self.staff.refresh_from_db()
        self.assertEqual(self.staff.email, 'sarah@bookhero.com')

    def test_the_change_stands_even_if_the_second_email_cannot_be_sent(self):
        challenge = self.start().data['challenge']
        code = latest_code()
        with mock.patch('authentication.services.action_otp_service.send_action_otp_email', side_effect=OSError('smtp down')):
            response = self.confirm(challenge, code)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['user']['email'], 'sarah.new@bookhero.com')
        self.assertIsNone(response.data['verification'])
        self.assertFalse(ActionOTP.objects.filter(purpose=ActionOTP.Purpose.EMAIL_VERIFY).exists())

    def test_failed_first_email_leaves_no_pending_code(self):
        with mock.patch('authentication.services.action_otp_service.send_action_otp_email', side_effect=OSError('smtp down')):
            response = self.start()
        self.assertEqual(response.status_code, OtpDeliveryError.status_code)
        self.assertFalse(ActionOTP.objects.exists())

    # ---- step 3: confirm the new address is real ----
    def test_second_code_marks_the_new_email_verified(self):
        _, verification_challenge = self.full_flow()
        response = self.verify(verification_challenge, latest_code())
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['email_verified'])
        self.staff.refresh_from_db()
        self.assertTrue(self.staff.email_verified)

    def test_wrong_second_code_keeps_the_email_unverified(self):
        _, verification_challenge = self.full_flow()
        code = latest_code()
        response = self.verify(verification_challenge, '0000' if code != '0000' else '1111')
        self.assertEqual(response.data['code'], 'otp_incorrect')
        self.staff.refresh_from_db()
        self.assertFalse(self.staff.email_verified)

    def test_the_admin_approval_code_cannot_verify_the_address(self):
        challenge = self.start().data['challenge']
        approval_code = latest_code()
        self.confirm(challenge, approval_code)
        response = self.verify(challenge, approval_code)  # wrong purpose
        self.assertEqual(response.status_code, 400)
        self.staff.refresh_from_db()
        self.assertFalse(self.staff.email_verified)

    def test_asking_again_for_the_verification_code(self):
        self.full_flow()
        self.age_codes()
        mail.outbox.clear()
        response = self.client.post(self.url('staff-email-verification'), format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['email_hint'], 's********@bookhero.com')
        self.assertEqual(mail.outbox[0].to, ['sarah.new@bookhero.com'])
        self.assertEqual(self.verify(response.data['challenge'], latest_code()).status_code, 200)

    def test_asking_again_too_soon_is_a_cooldown(self):
        self.full_flow()  # the second code was just sent
        response = self.client.post(self.url('staff-email-verification'), format='json')
        self.assertEqual(response.status_code, 429)

    def test_a_verified_email_has_nothing_to_verify(self):
        response = self.client.post(self.url('staff-email-verification'), format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'already_verified')

    # ---- sign-in and access ----
    def test_staff_signs_in_with_the_new_email_even_before_it_is_verified(self):
        self.full_flow()
        mail.outbox.clear()
        client = APIClient()
        new = client.post(reverse('authentication:login'), {'email': 'sarah.new@bookhero.com', 'password': STAFF_PASSWORD}, format='json')
        old = client.post(reverse('authentication:login'), {'email': 'sarah@bookhero.com', 'password': STAFF_PASSWORD}, format='json')
        self.assertEqual(new.status_code, 200)
        self.assertEqual(old.status_code, 401)
        self.assertEqual(len(mail.outbox), 0)  # staff never get a sign-in code

    def test_only_the_admin_can_use_these_endpoints(self):
        client = APIClient()
        staff_tokens = client.post(reverse('authentication:login'), {'email': 'sarah@bookhero.com', 'password': STAFF_PASSWORD}, format='json').data
        anonymous = APIClient()
        for name, body in [('staff-email-change', {'new_email': 'x@bookhero.com'}), ('staff-email-change-confirm', {'challenge': 'c', 'otp': '1234'}), ('staff-email-verification', {}), ('staff-email-verification-confirm', {'challenge': 'c', 'otp': '1234'})]:
            self.assertEqual(anonymous.post(self.url(name), body, format='json').status_code, 401, name)
            client.credentials(HTTP_AUTHORIZATION=f'Bearer {staff_tokens["access"]}')
            self.assertEqual(client.post(self.url(name), body, format='json').status_code, 403, name)

    def test_admin_accounts_and_unknown_ids_are_404(self):
        for staff in (self.admin,):
            self.assertEqual(self.start(staff=staff).status_code, 404)
        self.assertEqual(self.client.post(reverse('authentication:staff-email-change', args=[999999]), {'new_email': 'x@bookhero.com'}, format='json').status_code, 404)
        self.assertFalse(ActionOTP.objects.exists())
