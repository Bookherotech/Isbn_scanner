from django.core import mail
from django.test import TestCase

from authentication.models import User
from authentication.services import mask_email, send_otp_email


class OtpEmailTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser('rachel@bookhero.com', 'pass-12345-xyz', full_name='Rachel <Morgan> & Co')
        send_otp_email(self.admin, '4821')
        self.message = mail.outbox[0]
        self.html = self.message.alternatives[0].content

    def test_headers(self):
        self.assertEqual(self.message.subject, 'Your BookHero verification code')
        self.assertEqual(self.message.to, ['rachel@bookhero.com'])
        self.assertEqual(self.message.alternatives[0].mimetype, 'text/html')

    def test_plain_text_part_has_the_code(self):
        self.assertIn('Your code: 4821', self.message.body)
        self.assertIn('5 minutes', self.message.body)
        self.assertIn('Rachel <Morgan> & Co', self.message.body)  # no HTML escaping in plain text

    def test_html_has_each_digit_in_its_own_box_and_the_brand_colours(self):
        for digit in '4821':
            self.assertIn(f'>{digit}</td>', self.html)
        for colour in ('#ffd21f', '#e3262b', '#17150f', '#fff6cc'):  # hero yellow, signal red, ink, hero-subtle
            self.assertIn(colour, self.html)
        self.assertIn('BookHero', self.html)

    def test_html_escapes_the_name(self):
        self.assertIn('Rachel &lt;Morgan&gt; &amp; Co', self.html)
        self.assertNotIn('<Morgan>', self.html)

    def test_preview_text_never_contains_the_code(self):
        preview = self.html.split('</div>')[0]
        self.assertNotIn('4821', preview)

    def test_logo_is_attached_inline_and_referenced_by_cid(self):
        self.assertIn('src="cid:bookhero-logo"', self.html)
        raw = self.message.message().as_string()
        self.assertIn('Content-ID: <bookhero-logo>', raw)
        self.assertIn('multipart/related', raw)

    def test_mask_email(self):
        self.assertEqual(mask_email('rachel@bookhero.com'), 'r*****@bookhero.com')
        self.assertEqual(mask_email('al@x.io'), 'a***@x.io')
