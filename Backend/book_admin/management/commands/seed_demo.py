import random
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from authentication.constants import Role
from authentication.models import User
from book_admin.models import ActivityLog, AppSettings, FlagCategory, Notification, NotificationRead
from inventory.constants import BookSource, BookStatus, ShelfStatus
from inventory.models import Book, Shelf
from inventory.services import duplicate_key, is_valid_isbn13
from integrations.metadata import MetadataNotFound, MetadataUnavailable, lookup_isbn

PASSWORD = 'BookHero@2026'

STAFF = [
    ('Sarah Wilson', 'sarah@bookhero.com', '+971501110001'),
    ('Michael Brown', 'michael@bookhero.com', '+971501110002'),
    ('David Miller', 'david@bookhero.com', '+971501110003'),
    ('Emma Johnson', 'emma@bookhero.com', '+971501110004'),
    ('James Carter', 'james@bookhero.com', '+971501110005'),
]

# Real ISBN-13s. Title, author, publisher, year and page count are fetched live from Open Library / Google Books;
# an ISBN the providers do not know is skipped.
ISBNS = [
    '9780061120084', '9780451524935', '9780743273565', '9780141439518', '9780547928227', '9780439023481', '9780316769488',
    '9780062315007', '9780307474278', '9780385490818', '9780062316110', '9780735211292', '9780525559474', '9780143039433',
    '9780060850524', '9780544003415', '9780590353427', '9780439064873', '9780439136365', '9780316015844', '9780375842207',
    '9781594631931', '9780156012195', '9780140449266', '9780553380163', '9780307387899', '9780439023528', '9780439023511',
]
SHELVES = [f'A-{i:02d}' for i in range(1, 13)] + [f'B-{i:02d}' for i in range(1, 9)] + [f'C-{i:02d}' for i in range(1, 7)]

# What each fetched book becomes, in order.
PLAN = ['live'] * 14 + ['out_of_stock'] * 3 + ['pending'] * 5 + ['rejected'] * 2


class Command(BaseCommand):
    help = 'Fill the database with a demo admin, staff, shelves and real books (metadata fetched live). Safe to run again: existing rows are kept.'

    def add_arguments(self, parser):
        parser.add_argument('--admin-email', default='admin@bookhero.com')
        parser.add_argument('--reset-books', action='store_true', help='Delete every book first, then seed again.')

    def handle(self, *args, **options):
        rng = random.Random(2026)
        admin, staff = self.users(options['admin_email'])
        shelves = self.shelves()
        records = self.fetch_records()
        if not records:
            self.stderr.write('No book details could be fetched (offline?). Users and shelves were created; books were skipped.')
            return
        if options['reset_books']:
            Book.objects.all().delete()
        if Book.objects.exists():
            self.stdout.write('Books already exist: left as they are (use --reset-books to start over).')
            return
        with transaction.atomic():
            self.books(rng, records, admin, staff, shelves)
            self.history(admin)
        self.flag_categories()
        self.stdout.write(self.style.SUCCESS(f'Seeded {Book.objects.count()} books. Sign in with {options["admin_email"]} / {PASSWORD} (staff: sarah@bookhero.com / {PASSWORD}).'))

    def history(self, admin):
        """Activity log, notifications and settings, written from the books' own timestamps (no invented events)."""
        A, K, R, N = ActivityLog.ActorType, ActivityLog.Kind, ActivityLog.Result, Notification.Type
        AppSettings.objects.all().delete()
        AppSettings.objects.create(store_name='BookHero Store', store_location='BookHero Warehouse')
        ActivityLog.objects.all().delete()
        Notification.objects.all().delete()
        logs, notes = [], []
        for b in Book.objects.select_related('shelf', 'submitted_by', 'linked_item__shelf').order_by('id'):
            name = f'“{b.title}”'
            logs.append(ActivityLog(actor=b.submitted_by, action='Submitted', target=name, detail=f'Shelf {b.shelf.code} · qty {b.quantity}', kind=K.SUBMISSION, result=R.INFO, book=b, created_at=b.submitted_at))
            if b.approved_at:
                logs.append(ActivityLog(actor=b.approved_by, action='Approved', target=name, detail=f'Shelf {b.shelf.code} · qty {b.quantity}', kind=K.APPROVAL, book=b, created_at=b.approved_at))
                notes.append(Notification(type=N.APPROVED, recipient=b.submitted_by, title='Approved', body=f'{name} is now live (shelf {b.shelf.code}).', book=b, created_at=b.approved_at))
            if b.status == BookStatus.REJECTED:
                logs.append(ActivityLog(actor=b.rejected_by, action='Rejected', target=name, detail=b.reject_reason, kind=K.REJECTION, result=R.ERROR, book=b, created_at=b.rejected_at))
                notes.append(Notification(type=N.REJECTED, recipient=b.submitted_by, title='Rejected', body=f'{name} was rejected: {b.reject_reason.lower()}.', book=b, push=False, created_at=b.rejected_at))
            if b.status == BookStatus.WAITING:
                logs.append(ActivityLog(actor_type=A.SYSTEM, action='Waiting list created', target=name, detail=f'{b.match["shelf_id"]} active · waiting on {b.shelf.code}', kind=K.WAITING, result=R.WARNING, book=b, created_at=b.submitted_at))
                notes.append(Notification(type=N.WAITING_CREATED, audience='admin', title='Waiting-list entry', body=f'{name} was added on {b.shelf.code}. Current stock is on {b.match["shelf_id"]}.', book=b, push=False, created_at=b.submitted_at))
                if b.linked_item and b.linked_item.status == BookStatus.OUT_OF_STOCK:
                    notes.append(Notification(type=N.WAITING_READY, audience='admin', title='Waiting list ready', body=f'{b.title} is out of stock — the entry on {b.shelf.code} is ready for approval.', book=b, created_at=b.waiting_ready_at))
            if b.status == BookStatus.PENDING:
                notes.append(Notification(type=N.NEW_SUBMISSION, audience='admin', title='New submission', body=f'{b.submitted_by.full_name.split()[0]} submitted {name} for review.', book=b, push=False, created_at=b.submitted_at))
            if b.status == BookStatus.OUT_OF_STOCK:
                logs.append(ActivityLog(actor_type=A.SYSTEM, action='Stock reached 0', target=name, detail=f'Shelf {b.shelf.code} · detected by stock check', kind=K.STOCK, result=R.WARNING, book=b, created_at=b.stock_out_at))
                notes.append(Notification(type=N.STOCK_OUT, audience='all', title='Stock out', body=f'{b.title} is now out of stock on shelf {b.shelf.code}.', book=b, created_at=b.stock_out_at))
        ActivityLog.objects.bulk_create(logs)
        Notification.objects.bulk_create(notes)
        cutoff = timezone.now() - timedelta(days=2)
        old = Notification.objects.filter(created_at__lt=cutoff)
        NotificationRead.objects.bulk_create([NotificationRead(notification=n, user=admin) for n in old if n.audience in ('all', 'admin')])
        self.stdout.write(f'Wrote {len(logs)} activity lines and {len(notes)} notifications.')

    def flag_categories(self):
        defaults = [
            ('LGBTQ+ themes', 'LGBTQ+ characters, relationships or themes.', ['lgbt', 'lgbtq', 'gay', 'lesbian', 'queer', 'bisexual', 'transgender'], 'hold', True, 330),
            ('Mature / sexual content', 'Explicit sexual content or adult themes.', ['sexual content', 'erotica', 'explicit'], 'hold', True, 350),
            ('Self-harm & suicide', 'Depictions or discussion of self-harm or suicide.', ['suicide', 'self-harm'], 'hold', True, 15),
            ('Graphic violence', 'Detailed violence, gore or true crime.', ['graphic violence', 'gore', 'true crime'], 'label', True, 25),
            ('Politics', 'Political fiction or non-fiction.', ['politics', 'political fiction', 'political science'], 'label', True, 210),
            ('Drugs & alcohol', 'Substance use or addiction as a central theme.', ['drug use', 'addiction', 'alcoholism'], 'label', True, 160),
            ('Religion & spirituality', 'Religious or spiritual subject matter.', ['religion', 'theology', 'spirituality'], 'label', False, 45),
        ]
        for name, description, keywords, mode, enabled, hue in defaults:
            FlagCategory.objects.get_or_create(name=name, defaults={'description': description, 'keywords': keywords, 'mode': mode, 'enabled': enabled, 'hue': hue})

    def users(self, admin_email):
        admin, _ = User.objects.get_or_create(email=admin_email, defaults={'full_name': 'Rachel Morgan', 'phone_number': '+971501110000', 'role': Role.ADMIN})
        if admin.has_usable_password() is False or not admin.password:
            admin.set_password(PASSWORD)
            admin.save()
        people = []
        for name, email, phone in STAFF:
            user = User.objects.filter(email=email).first() or User.objects.create_user(email, PASSWORD, full_name=name, phone_number=phone, role=Role.STAFF)
            people.append(user)
        return admin, people

    def shelves(self):
        out = {}
        for code in SHELVES:
            out[code], _ = Shelf.objects.get_or_create(code=code, defaults={
                'status': ShelfStatus.INACTIVE if code == 'C-06' else ShelfStatus.ACTIVE,
                'note': 'Water leak — closed for repair' if code == 'C-06' else '',
            })
        return out

    def fetch_records(self):
        records = []
        for isbn in ISBNS:
            if not is_valid_isbn13(isbn):
                continue
            try:
                record = lookup_isbn(isbn)
            except (MetadataNotFound, MetadataUnavailable):
                self.stderr.write(f'  skipped {isbn} (not found)')
                continue
            if not record.get('title') or not record.get('author'):
                self.stderr.write(f'  skipped {isbn} (provider has no {"title" if not record.get("title") else "author"})')
                continue
            records.append(record)
        self.stdout.write(f'Fetched details for {len(records)} of {len(ISBNS)} books.')
        return records

    def books(self, rng, records, admin, staff, shelves):
        now = timezone.now()
        active = [s for code, s in shelves.items() if s.status == ShelfStatus.ACTIVE]
        rng.shuffle(active)
        free = iter(active)  # one shelf per book until they run out, then any
        made = {'live': [], 'out_of_stock': [], 'pending': [], 'rejected': []}

        def make(record, shelf, status, by, hours_ago, **extra):
            title, author = record['title'], record['author']
            fetched = {k: record.get(k) or '' for k in ('title', 'author', 'publisher', 'year', 'pages')}
            fetched['isbn'] = record['isbn']
            return Book.objects.create(
                isbn=record['isbn'], title=title, author=author, publisher=record.get('publisher', ''), year=record.get('year') or None,
                pages=record.get('pages') or None, source=record.get('source') or BookSource.OPEN_LIBRARY, subjects=record.get('subjects') or [],
                cover_url=record.get('cover_url', ''), fetched=fetched, missing_fields=record.get('missing', []),
                duplicate_key=duplicate_key(title, author), shelf=shelf, status=status, submitted_by=by,
                submitted_at=now - timedelta(hours=hours_ago), **extra,
            )

        for record, kind in zip(records, PLAN):
            by, hours = rng.choice(staff), rng.randint(2, 230)
            quantity = rng.randint(2, 18)
            shelf = next(free, None) or rng.choice(active)
            if kind in ('live', 'out_of_stock'):
                approved = now - timedelta(hours=max(1, hours - rng.randint(1, 6)))
                extra = {'quantity': quantity, 'approved_by': admin, 'approved_at': approved, 'stock': quantity if kind == 'live' else 0}
                if kind == 'live':
                    extra['stock'] = rng.randint(1, quantity)
                else:
                    extra['stock_out_at'] = now - timedelta(hours=rng.randint(1, 20))
                made[kind].append(make(record, shelf, kind, by, hours, **extra))
            elif kind == 'pending':
                made[kind].append(make(record, shelf, kind, by, rng.randint(1, 60), quantity=quantity))
            else:
                reason = rng.choice(['Incorrect metadata', 'Damaged book'])
                made[kind].append(make(record, shelf, kind, by, hours, quantity=quantity, rejected_by=admin, rejected_at=now - timedelta(hours=max(1, hours - 3)), reject_reason=reason))

        # Same book on another shelf: waits behind the current copy (two are ready: their copy already sold out).
        recs = {b.isbn: next(r for r in records if r['isbn'] == b.isbn) for b in made['live'] + made['out_of_stock']}
        behind = made['out_of_stock'][:2] + made['live'][:2]
        for primary in behind:
            ready = primary.status == BookStatus.OUT_OF_STOCK
            shelf = rng.choice([s for s in active if s.id != primary.shelf_id])
            match = {'item_id': primary.id, 'title': primary.title, 'author': primary.author, 'isbn': primary.isbn, 'shelf_id': primary.shelf.code,
                     'quantity': primary.stock if primary.status in (BookStatus.LIVE, BookStatus.OUT_OF_STOCK) else primary.quantity, 'status': primary.status}
            make(recs[primary.isbn], shelf, BookStatus.WAITING, rng.choice(staff), rng.randint(2, 40), quantity=rng.randint(2, 12),
                 linked_item=primary, match=match, waiting_ready_at=primary.stock_out_at if ready else None)
