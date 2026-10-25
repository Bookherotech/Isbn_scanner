from unittest import mock

from django.urls import reverse
from django.utils import timezone

from book_admin.models import FlagCategory
from book_admin.tests.helpers import AdminApiTestCase, make_book
from inventory.constants import BookStatus


class DashboardFlagTests(AdminApiTestCase):
    def test_only_unreviewed_pending_or_waiting_books_need_review(self):
        FlagCategory.objects.create(name='Adult', mode=FlagCategory.Mode.HOLD, keywords=['erotica'], hue=10)
        held = make_book(self.staff, self.a01, title='Erotica One', author='Anon')
        make_book(self.staff, self.a02, title='Erotica Two', author='Anon', status=BookStatus.LIVE, stock=1)  # already approved
        make_book(self.staff, self.a02, title='Erotica Three', author='Anon', flag_reviewed_at=timezone.now())  # already reviewed
        make_book(self.staff, self.a02, title='Dune', author='Frank Herbert')  # no match
        dashboard = self.client.get(reverse('book_admin:dashboard')).data
        self.assertEqual([b['id'] for b in dashboard['attention']['flagged']], [held.id])
        self.assertEqual(self.client.get(reverse('book_admin:nav-counts')).data['flagged'], 1)

    def test_no_holding_category_reads_no_books(self):
        FlagCategory.objects.create(name='Label', mode=FlagCategory.Mode.LABEL, keywords=['erotica'], hue=10)
        make_book(self.staff, self.a01, title='Erotica One', author='Anon')
        self.assertEqual(self.client.get(reverse('book_admin:dashboard')).data['attention']['flagged'], [])


class OutOfStockLimitTests(AdminApiTestCase):
    def test_list_is_capped_newest_first(self):
        now = timezone.now()
        books = [make_book(self.staff, self.a01, title=f'Sold {i}', status=BookStatus.OUT_OF_STOCK, stock=0, stock_out_at=now - timezone.timedelta(days=i)) for i in range(3)]
        with mock.patch('book_admin.views.inventory_views.OUT_OF_STOCK_LIMIT', 2):
            rows = self.client.get(reverse('book_admin:out-of-stock')).data
        self.assertEqual([r['id'] for r in rows], [books[0].id, books[1].id])
