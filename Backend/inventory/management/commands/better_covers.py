from django.core.management.base import BaseCommand

from inventory.services.cover_cache import UPGRADE_BATCH, upgrade_recent_covers


class Command(BaseCommand):
    help = 'Swap narrow saved covers of recently submitted books for bigger ones from the providers (staff photos are kept).'

    def add_arguments(self, parser):
        parser.add_argument('--days', type=int, default=1, help='Books submitted in the last N days (default 1: today\'s scanning).')
        parser.add_argument('--limit', type=int, default=UPGRADE_BATCH, help=f'Most books to check (default {UPGRADE_BATCH}).')

    def handle(self, *args, **options):
        self.stdout.write(str(upgrade_recent_covers(options['days'], options['limit'])))
