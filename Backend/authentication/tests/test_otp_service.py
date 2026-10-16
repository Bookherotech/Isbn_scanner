from datetime import timedelta
from unittest import mock

from django.core import mail
from django.test import TestCase
from django.utils import timezone

from authentication.constants import (
    OTP_LENGTH,
    OTP_MAX_ATTEMPTS,
    OTP_MAX_SENDS,
    OTP_RESEND_COOLDOWN_SECONDS,
    OTP_TTL_SECONDS,
)
from authentication.exceptions import (
    ChallengeExpired,
    InvalidChallenge,
    OtpDeliveryError,
    ResendCooldown,
    TooManyAttempts,
    TooManyResends,
    WrongCode,
)
from authentication.models import LoginOTP, User
from authentication.services import resend_challenge, start_challenge, verify_challenge
from authentication.services.otp_service import generate_code, hash_challenge
from authentication.tests.helpers import latest_code

PASSWORD = 'pass-12345-xyz'


class GenerateCodeTests(TestCase):
    def test_codes_are_four_digits_and_zero_padded(self):
        with mock.patch('authentication.services.otp_service.secrets.randbelow', return_value=7):
            self.assertEqual(generate_code(), '0007')
        for _ in range(200):
            code = generate_code()
            self.assertEqual(len(code), OTP_LENGTH)
            self.assertTrue(code.isdigit())


class OtpServiceTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser('admin@bookhero.com', PASSWORD, full_name='Rachel Morgan')

    def start(self):
        return start_challenge(self.admin)

    def test_start_emails_the_code_and_stores_only_a_hash(self):
        challenge = self.start()
        code = latest_code()
        row = LoginOTP.objects.get(user=self.admin)
        self.assertEqual(challenge.expires_in, OTP_TTL_SECONDS)
        self.assertEqual(mail.outbox[-1].to, ['admin@bookhero.com'])
        self.assertNotIn(code, (row.code_hash, row.challenge_hash))
        self.assertNotEqual(row.challenge_hash, challenge.token)
        self.assertEqual(row.challenge_hash, hash_challenge(challenge.token))

    def test_correct_code_returns_the_user_once(self):
        challenge = self.start()
        code = latest_code()
        self.assertEqual(verify_challenge(challenge.token, code), self.admin)
        with self.assertRaises(InvalidChallenge):  # single use
            verify_challenge(challenge.token, code)

    def test_wrong_code_counts_down_and_then_locks(self):
        challenge = self.start()
        code = latest_code()
        wrong = '0000' if code != '0000' else '1111'
        for left in range(OTP_MAX_ATTEMPTS - 1, -1, -1):
            with self.assertRaises(WrongCode) as caught:
                verify_challenge(challenge.token, wrong)
            self.assertEqual(caught.exception.detail['attempts_left'], left)
        with self.assertRaises(TooManyAttempts):
            verify_challenge(challenge.token, wrong)
        with self.assertRaises(TooManyAttempts):  # even the right code is refused now
            verify_challenge(challenge.token, code)

    def test_expired_code_is_rejected(self):
        challenge = self.start()
        code = latest_code()
        LoginOTP.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        with self.assertRaises(ChallengeExpired):
            verify_challenge(challenge.token, code)

    def test_unknown_token_is_rejected(self):
        with self.assertRaises(InvalidChallenge):
            verify_challenge('not-a-real-token', '1234')

    def test_new_sign_in_cancels_the_previous_one(self):
        first = self.start()
        first_code = latest_code()
        second = self.start()
        self.assertEqual(LoginOTP.objects.filter(user=self.admin).count(), 1)
        with self.assertRaises(InvalidChallenge):
            verify_challenge(first.token, first_code)
        verify_challenge(second.token, latest_code())

    def test_code_does_not_work_with_another_challenge(self):
        other = User.objects.create_superuser('other@bookhero.com', PASSWORD)
        first = self.start()
        first_code = latest_code()
        second = start_challenge(other)
        second_code = latest_code()
        wrong = first_code if first_code != second_code else None
        if wrong:
            with self.assertRaises(WrongCode):
                verify_challenge(second.token, wrong)

    def test_deactivated_user_cannot_finish(self):
        challenge = self.start()
        code = latest_code()
        User.objects.filter(pk=self.admin.pk).update(is_active=False)
        with self.assertRaises(InvalidChallenge):
            verify_challenge(challenge.token, code)

    def test_failed_email_removes_the_challenge(self):
        with mock.patch('authentication.services.otp_service.send_otp_email', side_effect=OSError('smtp down')):
            with self.assertRaises(OtpDeliveryError):
                self.start()
        self.assertFalse(LoginOTP.objects.exists())

    def test_verify_uses_few_queries(self):
        challenge = self.start()
        code = latest_code()
        with self.assertNumQueries(3):  # find the challenge together with its user, count the attempt, mark it used
            verify_challenge(challenge.token, code)


class ResendTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser('admin@bookhero.com', PASSWORD)
        self.challenge = start_challenge(self.admin)

    def age_last_send(self):
        LoginOTP.objects.update(last_sent_at=timezone.now() - timedelta(seconds=OTP_RESEND_COOLDOWN_SECONDS + 1))

    def test_resend_is_blocked_during_cooldown(self):
        with self.assertRaises(ResendCooldown) as caught:
            resend_challenge(self.challenge.token)
        self.assertGreater(caught.exception.detail['retry_after'], 0)
        self.assertEqual(len(mail.outbox), 1)

    def test_resend_sends_a_new_code_and_old_one_stops_working(self):
        old_code = latest_code()
        self.age_last_send()
        resend_challenge(self.challenge.token)
        new_code = latest_code()
        self.assertEqual(len(mail.outbox), 2)
        if new_code != old_code:
            with self.assertRaises(WrongCode):
                verify_challenge(self.challenge.token, old_code)
        self.assertEqual(verify_challenge(self.challenge.token, new_code), self.admin)

    def test_resend_resets_attempts(self):
        wrong = '0000' if latest_code() != '0000' else '1111'
        with self.assertRaises(WrongCode):
            verify_challenge(self.challenge.token, wrong)
        self.age_last_send()
        resend_challenge(self.challenge.token)
        self.assertEqual(LoginOTP.objects.get().attempts, 0)

    def test_resend_count_is_limited(self):
        for _ in range(OTP_MAX_SENDS - 1):
            self.age_last_send()
            resend_challenge(self.challenge.token)
        self.age_last_send()
        with self.assertRaises(TooManyResends):
            resend_challenge(self.challenge.token)
        self.assertEqual(len(mail.outbox), OTP_MAX_SENDS)

    def test_resend_for_unknown_or_used_challenge_is_rejected(self):
        with self.assertRaises(InvalidChallenge):
            resend_challenge('nope')
        verify_challenge(self.challenge.token, latest_code())
        with self.assertRaises(InvalidChallenge):
            resend_challenge(self.challenge.token)
