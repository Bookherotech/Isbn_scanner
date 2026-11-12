from django.core.management.base import BaseCommand

from inventory.services import cache_missing_covers
from inventory.services.cover_cache import BATCH


class Command(BaseCommand):
    help = 'Keep a copy on this server of the covers of books that have none yet (run on a schedule).'

    def add_arguments(self, parser):
        parser.add_argument('--limit', type=int, default=BATCH, help=f'Most books to process in this run (default {BATCH}).')

    def handle(self, *args, **options):
        self.stdout.write(str(cache_missing_covers(options['limit'])))
