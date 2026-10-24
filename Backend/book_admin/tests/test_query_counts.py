"""N+1 guard: every admin endpoint runs the same number of queries for 1 row as for many rows."""

from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django.utils import timezone

from book_admin.tests.helpers import AdminApiTestCase, make_book
from inventory.constants import BookStatus

MANY = 12


class QueryCountTests(AdminApiTestCase):
    def add_rows(self, count):
        """Rows touching every relation the admin screens read: shelf, linked entry + shelf, submitter, approver, rejecter, waiting entries."""
        now = timezone.now()
        for i in range(count):
            primary = make_book(self.other_staff, self.a02, title=f'Primary {i}', status=BookStatus.OUT_OF_STOCK, stock=0, product_id=f'P{i}', approved_by=self.admin, approved_at=now, stock_out_at=now)
            make_book(self.staff, self.a01, title=f'Primary {i}', status=BookStatus.WAITING, linked_item=primary)
            make_book(self.staff, self.a01, title=f'Live {i}', status=BookStatus.LIVE, stock=1, approved_by=self.admin, approved_at=now, sync_status='failed')
            make_book(self.staff, self.a01, title=f'Rejected {i}', status=BookStatus.REJECTED, rejected_by=self.admin, rejected_at=now)
            make_book(self.staff, self.a01, title=f'Pending {i}')

    def count(self, url):
        with CaptureQueriesContext(connection) as ctx:
            response = self.client.get(url)
        self.assertEqual(response.status_code, 200, response.data)
        return len(ctx.captured_queries)

    def test_endpoints_are_flat(self):
        self.add_rows(1)
        book = make_book(self.staff, self.a01, title='Detail', status=BookStatus.LIVE, stock=1, product_id='PX')
        urls = [reverse(f'book_admin:{n}') for n in ('dashboard', 'nav-counts', 'waiting-list', 'out-of-stock', 'shelf-list', 'options', 'reports', 'author-list')]
        urls += [reverse('book_admin:book-list') + '?page_size=500', reverse('book_admin:search') + '?q=pri', reverse('book_admin:book-detail', args=[book.id])]
        before = {url: self.count(url) for url in urls}
        self.add_rows(MANY)
        for url in urls:
            self.assertEqual(self.count(url), before[url], url)
