from django.core.cache import cache
from django.urls import reverse

from inventory.constants import BookStatus
from inventory.models import Book
from staff_api.tests.helpers import StaffApiTestCase, make_book

FETCHED = {'title': 'The Great Gatsby', 'author': 'F. Scott Fitzgerald', 'publisher': 'Penguin', 'year': 2000, 'pages': 180}


class SubmissionCreateApiTests(StaffApiTestCase):
    def setUp(self):
        super().setUp()
        self.url = reverse('staff_api:submissions')

    def submit(self, **overrides):
        body = {
            'isbn': '9780141182636', 'title': 'The Great Gatsby', 'author': 'F. Scott Fitzgerald', 'publisher': 'Penguin',
            'year': '2000', 'pages': '180', 'source': 'google', 'subjects': ['Fiction'], 'fetched': FETCHED,
            'shelf_id': 'A-01', 'quantity': 3,
        }
        body.update(overrides)
        return self.client.post(self.url, body, format='json')

    # ---- outcomes ----

    def test_new_book_is_pending(self):
        response = self.submit()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['result'], 'pending')
        self.assertIsNone(response.data['match'])
        self.assertEqual(response.data['flags'], [])
        self.assertFalse(response.data['flag_hold'])
        item = response.data['item']
        self.assertEqual((item['status'], item['shelf_id'], item['quantity'], item['submitted_by_name']), ('pending', 'A-01', 3, 'Sarah Wilson'))
        self.assertEqual(response.data['key'], {'title': 'great gatsby', 'author': 'fitzgerald scott'})

        book = Book.objects.get()
        self.assertEqual(book.submitted_by, self.staff)
        self.assertEqual((book.year, book.pages, book.subjects, book.edited_fields), (2000, 180, ['Fiction'], []))
        self.assertEqual(book.duplicate_key, 'great gatsby|fitzgerald scott')

    def test_same_book_on_the_same_shelf_is_rejected_automatically(self):
        make_book(self.other_staff, self.a01, title='Great Gatsby: A Novel', author='Fitzgerald, F. Scott', status=BookStatus.LIVE, stock=2, isbn='9780743273565')
        response = self.submit()
        self.assertEqual(response.data['result'], 'rejected')
        self.assertEqual(response.data['match']['shelf_id'], 'A-01')
        self.assertEqual(response.data['match']['quantity'], 2)  # live entry: the Shopify stock
        self.assertEqual(response.data['match']['isbn'], '9780743273565')
        item = response.data['item']
        self.assertEqual((item['status'], item['auto_rejected'], item['rejected_by_name'], item['reject_reason']), ('rejected', True, 'System', 'Duplicate — same shelf'))

    def test_same_book_on_another_shelf_goes_on_the_waiting_list(self):
        live = make_book(self.other_staff, self.a02, status=BookStatus.LIVE, stock=4)
        response = self.submit()
        self.assertEqual(response.data['result'], 'waiting')
        self.assertFalse(response.data['ready'])
        self.assertEqual(response.data['match']['shelf_id'], 'A-02')
        item = response.data['item']
        self.assertEqual(item['linked'], {'id': live.id, 'shelf_id': 'A-02', 'status': 'live', 'stock': 4, 'quantity': 3})
        self.assertFalse(item['ready'])
        self.assertIsNone(Book.objects.get(pk=item['id']).waiting_ready_at)

    def test_waiting_entry_is_ready_when_the_current_stock_is_sold_out(self):
        make_book(self.other_staff, self.a02, status=BookStatus.OUT_OF_STOCK, stock=0)
        response = self.submit()
        self.assertEqual(response.data['result'], 'waiting')
        self.assertTrue(response.data['ready'])
        self.assertTrue(response.data['item']['ready'])
        self.assertIsNotNone(Book.objects.get(pk=response.data['item']['id']).waiting_ready_at)

    def test_a_pending_entry_on_another_shelf_also_counts(self):
        pending = make_book(self.other_staff, self.a02)
        response = self.submit()
        self.assertEqual(response.data['result'], 'waiting')
        self.assertEqual(response.data['item']['linked']['id'], pending.id)

    def test_live_entry_is_preferred_over_a_pending_one(self):
        make_book(self.other_staff, self.c06)  # pending entry (shelf since closed)
        live = make_book(self.other_staff, self.a02, status=BookStatus.LIVE, stock=1)
        response = self.submit()
        self.assertEqual(response.data['item']['linked']['id'], live.id)

    def test_rejected_and_closed_entries_do_not_count(self):
        make_book(self.other_staff, self.a01, status=BookStatus.REJECTED)
        make_book(self.other_staff, self.a02, status=BookStatus.CLOSED)
        self.assertEqual(self.submit().data['result'], 'pending')

    def test_different_book_is_not_a_duplicate(self):
        make_book(self.other_staff, self.a01, title='Tender Is the Night')
        self.assertEqual(self.submit().data['result'], 'pending')

    # ---- stored details ----

    def test_edited_fields_are_worked_out_on_the_server(self):
        self.submit(title='The Great Gatsby (Penguin Modern Classics)', pages='192')
        self.assertEqual(Book.objects.get().edited_fields, ['title', 'pages'])

    def test_missing_fields_come_from_the_fetched_record(self):
        self.submit(fetched={**FETCHED, 'publisher': '', 'pages': None}, publisher='', pages='')
        self.assertEqual(Book.objects.get().missing_fields, ['publisher', 'pages'])

    def test_manual_entry_has_no_fetched_record(self):
        self.submit(source='manual', fetched=FETCHED, subjects=['X'], year='', pages=None, publisher='')
        book = Book.objects.get()
        self.assertEqual((book.source, book.fetched, book.subjects, book.edited_fields, book.year, book.pages), ('manual', None, [], [], None, None))

    def test_isbn10_is_stored_as_isbn13_and_shelf_code_is_case_insensitive(self):
        self.submit(isbn='0-14-118263-6', shelf_id='a-01')
        book = Book.objects.get()
        self.assertEqual((book.isbn, book.shelf_id), ('9780141182636', self.a01.id))

    def test_cover_comes_from_the_cached_lookup(self):
        cache.set('metadata:isbn:9780141182636', {'cover_url': 'https://covers.example/x.jpg'})
        self.submit()
        self.assertEqual(Book.objects.get().cover_url, 'https://covers.example/x.jpg')

    def test_unknown_fetched_keys_are_dropped(self):
        self.submit(fetched={**FETCHED, 'status': 'live', 'evil': 'x' * 1000})
        self.assertEqual(set(Book.objects.get().fetched), set(FETCHED) | {'isbn'})  # the 5 fields + the first ISBN

    # ---- validation ----

    def test_invalid_input_is_rejected_and_nothing_is_saved(self):
        cases = [
            ({'isbn': '9780141182637'}, 'isbn'),
            ({'title': '   '}, 'title'),
            ({'author': ''}, 'author'),
            ({'year': '99'}, 'year'),
            ({'pages': '12a'}, 'pages'),
            ({'source': 'amazon'}, 'source'),
            ({'shelf_id': 'Z-99'}, 'shelf_id'),
            ({'shelf_id': 'C-06'}, 'shelf_id'),  # inactive shelf
            ({'quantity': 0}, 'quantity'),
            ({'quantity': 501}, 'quantity'),
        ]
        for body, field in cases:
            response = self.submit(**body)
            self.assertEqual(response.status_code, 400, body)
            self.assertIn(field, response.data, body)
        self.assertEqual(Book.objects.count(), 0)

    def test_required_fields(self):
        response = self.client.post(self.url, {}, format='json')
        self.assertEqual(response.status_code, 400)
        for field in ('isbn', 'title', 'author', 'shelf_id', 'quantity'):
            self.assertIn(field, response.data)

    def test_staff_only(self):
        self.sign_in_as(self.admin)
        self.assertEqual(self.submit().status_code, 403)
        self.client.credentials()
        self.assertEqual(self.submit().status_code, 401)
        self.assertEqual(Book.objects.count(), 0)
