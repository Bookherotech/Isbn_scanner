from django.core.management.base import BaseCommand
from django.db import transaction

from inventory.constants import BookStatus
from inventory.models import Book
from inventory.services import duplicate_key


class Command(BaseCommand):
    help = 'Recompute every book\'s duplicate key after the normalize rules change (run once after deploy). Safe to re-run.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Only report what would change.')

    def handle(self, *args, **options):
        changed = []
        for book in Book.objects.only('id', 'title', 'author', 'duplicate_key').iterator():
            key = duplicate_key(book.title, book.author)
            if key != book.duplicate_key:
                book.duplicate_key = key
                changed.append(book)
        if not options['dry_run']:
            with transaction.atomic():
                Book.objects.bulk_update(changed, ['duplicate_key'], batch_size=500)
        self.stdout.write(f'{"Would update" if options["dry_run"] else "Updated"} {len(changed)} book(s).')

        # Waiting entries linked behind a book that is no longer "the same book" under the new rules.
        keys = {b.id: b.duplicate_key for b in changed}
        wrong = []
        for entry in Book.objects.filter(status=BookStatus.WAITING, linked_item__isnull=False).select_related('linked_item'):
            mine = keys.get(entry.id, entry.duplicate_key)
            theirs = keys.get(entry.linked_item_id, entry.linked_item.duplicate_key)
            if mine != theirs:
                wrong.append(f'  #{entry.id} "{entry.title}" waits behind #{entry.linked_item_id} "{entry.linked_item.title}"')
        if wrong:
            self.stdout.write(f'{len(wrong)} waiting entry(ies) linked to a different book; review them in the admin Waiting list:')
            self.stdout.write('\n'.join(wrong))
