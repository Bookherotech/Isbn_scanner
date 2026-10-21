"""N+1 guard: every staff endpoint runs the same number of queries for 1 row as for many rows."""

from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django.utils import timezone

from inventory.constants import BookStatus
from staff_api.tests.helpers import StaffApiTestCase, make_book

MANY = 15


class QueryCountTests(StaffApiTestCase):
    def add_rows(self, count):
        """Submissions that touch every relation the staff screens show: shelf, linked entry + its shelf, approver, rejecter."""
        primary = make_book(self.other_staff, self.a02, title='Primary', status=BookStatus.OUT_OF_STOCK, stock=0)
        now = timezone.now()
        for i in range(count):
            make_book(self.staff, self.a01, title=f'Waiting {i}', status=BookStatus.WAITING, linked_item=primary)
            make_book(self.staff, self.a02, title=f'Live {i}', status=BookStatus.LIVE, stock=1, approved_by=self.admin, approved_at=now)
            make_book(self.staff, self.a01, title=f'Rejected {i}', status=BookStatus.REJECTED, rejected_by=self.admin, rejected_at=now)

    def queries_for(self, method, url, data=None):
        with CaptureQueriesContext(connection) as ctx:
            response = getattr(self.client, method)(url, data, format='json') if data is not None else getattr(self.client, method)(url)
        self.assertLess(response.status_code, 300, response.data)
        return len(ctx.captured_queries)

    def assert_flat(self, method, url, expected, data=None):
        self.add_rows(1)
        few = self.queries_for(method, url, data)
        self.add_rows(MANY)
        many = self.queries_for(method, url, data)
        self.assertEqual(few, many, f'{url}: {few} queries for 1 row but {many} for {MANY} rows (N+1)')
        self.assertEqual(many, expected, url)

    def test_list(self):
        # auth user + tab counts + rows (relations joined)
        self.assert_flat('get', reverse('staff_api:submissions') + '?limit=100', 3)

    def test_list_filtered(self):
        self.assert_flat('get', reverse('staff_api:submissions') + '?status=waiting&limit=100', 3)

    def test_home(self):
        # auth user + scanned + pending/waiting + approved + recent
        self.assert_flat('get', reverse('staff_api:home'), 5)

    def test_detail(self):
        book = make_book(self.staff, self.a01, status=BookStatus.WAITING, linked_item=make_book(self.other_staff, self.a02, status=BookStatus.LIVE, stock=2))
        # auth user + the row (relations joined)
        self.assert_flat('get', reverse('staff_api:submission-detail', args=[book.id]), 2)

    def test_create_does_not_grow_with_existing_duplicates(self):
        url = reverse('staff_api:submissions')
        body = {'isbn': '9780141182636', 'title': 'Same Book', 'author': 'Same Author', 'source': 'manual', 'shelf_id': 'A-01', 'quantity': 1}
        make_book(self.other_staff, self.a02, title='Same Book', author='Same Author', status=BookStatus.LIVE, stock=1)
        one = self.queries_for('post', url, body)
        for _ in range(MANY):
            make_book(self.other_staff, self.a02, title='Same Book', author='Same Author', status=BookStatus.WAITING)
        many = self.queries_for('post', url, body)
        self.assertEqual(one, many, f'create: {one} queries with 1 match but {many} with {MANY + 1} matches (N+1)')
