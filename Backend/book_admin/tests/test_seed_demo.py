from django.core.management import CommandError, call_command
from django.test import TestCase, override_settings

from authentication.models import User


class SeedDemoGuardTests(TestCase):
    @override_settings(DEBUG=False)
    def test_refuses_when_debug_is_off(self):
        with self.assertRaises(CommandError):
            call_command('seed_demo')
        self.assertFalse(User.objects.exists())  # nothing was created
