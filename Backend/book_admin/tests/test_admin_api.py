from datetime import timedelta

from django.urls import reverse

from book_admin.tests.helpers import AdminApiTestCase, make_book
from inventory.constants import BookStatus


class PermissionTests(AdminApiTestCase):
    def test_staff_cannot_use_admin_api(self):
        self.sign_in_as(self.staff)
        for name in ('dashboard', 'nav-counts', 'book-list', 'shelf-list', 'waiting-list', 'out-of-stock', 'reports', 'options'):
            self.assertEqual(self.client.get(reverse(f'book_admin:{name}')).status_code, 403, name)

    def test_anonymous_is_refused(self):
        self.client.credentials()
        self.assertEqual(self.client.get(reverse('book_admin:dashboard')).status_code, 401)


class ReviewTests(AdminApiTestCase):
    def test_approve_goes_live_with_stock(self):
        book = make_book(self.staff, self.a01, quantity=4)
        response = self.client.post(reverse('book_admin:book-approve', args=[book.id]))
        self.assertEqual(response.status_code, 200, response.data)
        book.refresh_from_db()
        self.assertEqual((book.status, book.stock, book.approved_by_id), (BookStatus.LIVE, 4, self.admin.id))
        self.assertEqual(self.client.post(reverse('book_admin:book-approve', args=[book.id])).data['code'], 'invalid_state')

    def test_reject_needs_note_for_other(self):
        book = make_book(self.staff, self.a01)
        url = reverse('book_admin:book-reject', args=[book.id])
        self.assertEqual(self.client.post(url, {'reason': 'Other'}, format='json').status_code, 400)
        response = self.client.post(url, {'reason': 'Damaged book'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['status'], 'rejected')
        self.assertEqual(response.data['rejected_by_name'], 'Rachel Morgan')

    def test_edit_to_same_shelf_duplicate_is_refused(self):
        make_book(self.other_staff, self.a02, title='Dune', author='Frank Herbert', status=BookStatus.LIVE, stock=2)
        book = make_book(self.staff, self.a01, title='Dune Copy', author='Frank Herbert')
        response = self.client.patch(reverse('book_admin:book-detail', args=[book.id]), {'title': 'Dune', 'shelf_id': 'A-02'}, format='json')
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data['code'], 'duplicate_same_shelf')

    def test_edit_moves_pending_to_waiting_and_back(self):
        primary = make_book(self.other_staff, self.a02, title='Dune', author='Frank Herbert', status=BookStatus.LIVE, stock=2)
        book = make_book(self.staff, self.a01, title='Dunes', author='Frank Herbert')
        url = reverse('book_admin:book-detail', args=[book.id])
        response = self.client.patch(url, {'title': 'Dune'}, format='json')
        self.assertEqual(response.data['outcome'], 'moved_to_waiting', response.data)
        book.refresh_from_db()
        self.assertEqual((book.status, book.linked_item_id), (BookStatus.WAITING, primary.id))
        response = self.client.patch(url, {'title': 'Something Else'}, format='json')
        self.assertEqual(response.data['outcome'], 'moved_to_pending')

    def test_edit_validates(self):
        book = make_book(self.staff, self.a01)
        url = reverse('book_admin:book-detail', args=[book.id])
        self.assertEqual(self.client.patch(url, {'year': '20x8'}, format='json').status_code, 400)
        self.assertEqual(self.client.patch(url, {'shelf_id': 'C-06'}, format='json').status_code, 400)  # inactive shelf
        self.assertEqual(self.client.patch(url, {'quantity': 0}, format='json').status_code, 400)
        response = self.client.patch(url, {'quantity': 9, 'publisher': ' Penguin '}, format='json')
        self.assertEqual(response.data['changes'], ['publisher', 'quantity'], response.data)

    def test_waiting_approval_switches_shelf(self):
        primary = make_book(self.other_staff, self.a02, title='Dune', author='Frank Herbert', status=BookStatus.OUT_OF_STOCK, stock=0, product_id='P1')
        entry = make_book(self.staff, self.a01, title='Dune', author='Frank Herbert', status=BookStatus.WAITING, linked_item=primary, quantity=5)
        other = make_book(self.staff, self.a01, title='Dune', author='Frank Herbert', status=BookStatus.WAITING, linked_item=primary)
        response = self.client.post(reverse('book_admin:waiting-approve', args=[entry.id]))
        self.assertEqual(response.status_code, 200, response.data)
        entry.refresh_from_db(), primary.refresh_from_db(), other.refresh_from_db()
        self.assertEqual((entry.status, entry.stock, entry.product_id, entry.previous_shelf_id), (BookStatus.LIVE, 5, 'P1', self.a02.id))
        self.assertEqual(primary.status, BookStatus.CLOSED)
        self.assertEqual(other.linked_item_id, entry.id)

    def test_waiting_approval_not_ready(self):
        primary = make_book(self.other_staff, self.a02, status=BookStatus.LIVE, stock=3)
        entry = make_book(self.staff, self.a01, status=BookStatus.WAITING, linked_item=primary)
        response = self.client.post(reverse('book_admin:waiting-approve', args=[entry.id]))
        self.assertEqual((response.status_code, response.data['code']), (409, 'not_ready'))


class ListingTests(AdminApiTestCase):
    def test_book_list_filters_and_pages(self):
        for i in range(25):
            make_book(self.staff, self.a01, title=f'Pending {i:02d}')
        make_book(self.staff, self.a02, title='Live one', status=BookStatus.LIVE, stock=2)
        data = self.client.get(reverse('book_admin:book-list'), {'status': 'pending', 'sort': 'title'}).data
        self.assertEqual((data['total'], data['pages'], data['page'], len(data['results'])), (25, 2, 1, 20))
        data = self.client.get(reverse('book_admin:book-list'), {'q': 'live one'}).data
        self.assertEqual(data['total'], 1)
        self.assertEqual(self.client.get(reverse('book_admin:book-list'), {'status': 'bogus'}).status_code, 400)

    def test_waiting_list_one_row_per_book_oldest_shelf_first(self):
        oos = make_book(self.other_staff, self.a02, title='Out', status=BookStatus.OUT_OF_STOCK, stock=0)
        live = make_book(self.other_staff, self.a02, title='Live', status=BookStatus.LIVE, stock=2)
        make_book(self.staff, self.a01, title='Live', status=BookStatus.WAITING, linked_item=live)
        newer = make_book(self.staff, self.c06, title='Out', status=BookStatus.WAITING, linked_item=oos)
        older = make_book(self.staff, self.a01, title='Out', status=BookStatus.WAITING, linked_item=oos)
        older.submitted_at = newer.submitted_at - timedelta(hours=5)
        older.save()
        data = self.client.get(reverse('book_admin:waiting-list')).data
        self.assertEqual(data['counts'], {'ready': 1, 'waiting': 1, 'all': 2})  # books, not entries
        first = data['results'][0]
        self.assertEqual((first['title'], first['ready']), ('Out', True))  # ready books first
        self.assertEqual([e['id'] for e in first['entries']], [older.id, newer.id])  # oldest shelf first
        self.assertEqual(len(data['results'][1]['entries']), 1)
        self.assertEqual(len(self.client.get(reverse('book_admin:waiting-list'), {'tab': 'ready'}).data['results']), 1)
        self.assertEqual(self.client.get(reverse('book_admin:nav-counts')).data['ready'], 1)

    def test_dashboard_numbers(self):
        make_book(self.staff, self.a01, title='P')
        make_book(self.staff, self.a02, title='L', status=BookStatus.LIVE, stock=7)
        data = self.client.get(reverse('book_admin:dashboard')).data
        self.assertEqual((data['kpis']['pending'], data['kpis']['live_titles'], data['kpis']['live_units']), (1, 1, 7))
        self.assertEqual(data['kpis']['added_today'], 2)
        self.assertEqual(len(data['added7']), 7)
        self.assertEqual(self.client.get(reverse('book_admin:nav-counts')).data['pending'], 1)

    def test_shelves_crud(self):
        make_book(self.staff, self.a01, status=BookStatus.LIVE, stock=6)
        rows = self.client.get(reverse('book_admin:shelf-list')).data
        a01 = next(r for r in rows if r['code'] == 'A-01')
        self.assertEqual((a01['titles'], a01['units']), (1, 6))
        response = self.client.post(reverse('book_admin:shelf-list'), {'code': 'b-09', 'note': 'near desk'}, format='json')
        self.assertEqual((response.status_code, response.data['code']), (201, 'B-09'))
        self.assertEqual(self.client.post(reverse('book_admin:shelf-list'), {'code': 'B-09'}, format='json').status_code, 400)
        self.assertEqual(self.client.post(reverse('book_admin:shelf-list'), {'code': 'bad'}, format='json').status_code, 400)
        url = reverse('book_admin:shelf-detail', args=['B-09'])
        self.assertEqual(self.client.patch(url, {'status': 'inactive'}, format='json').data['status'], 'inactive')
        self.assertEqual(self.client.patch(url, {'code': 'B-10'}, format='json').status_code, 400)

    def test_reports_shape(self):
        make_book(self.staff, self.a01)
        data = self.client.get(reverse('book_admin:reports'), {'days': 7}).data
        self.assertEqual(len(data['series']), 7)
        self.assertEqual(data['totals']['added'], 1)
        self.assertEqual(self.client.get(reverse('book_admin:reports'), {'days': 500}).status_code, 400)


class RejectionReasonTests(AdminApiTestCase):
    def test_reasons_list_filter_and_validation(self):
        reasons = self.client.get(reverse('book_admin:rejection-reasons')).data
        self.assertEqual(reasons, ['Incorrect metadata', 'Damaged book', 'Invalid shelf', 'Other'])
        a = make_book(self.staff, self.a01, title='A')
        b = make_book(self.staff, self.a01, title='B')
        for book, reason in ((a, 'Damaged book'), (b, 'Invalid shelf')):
            self.assertEqual(self.client.post(reverse('book_admin:book-reject', args=[book.id]), {'reason': reason}, format='json').status_code, 200)
        url = reverse('book_admin:book-list')
        self.assertEqual(self.client.get(url, {'status': 'rejected'}).data['total'], 2)
        self.assertEqual([r['title'] for r in self.client.get(url, {'status': 'rejected', 'reason': 'Damaged book'}).data['results']], ['A'])
        self.assertEqual(self.client.get(url, {'reason': 'nope'}).status_code, 400)
        c = make_book(self.staff, self.a01, title='C')
        self.assertEqual(self.client.post(reverse('book_admin:book-reject', args=[c.id]), {'reason': 'Duplicate — same shelf'}, format='json').status_code, 400)
