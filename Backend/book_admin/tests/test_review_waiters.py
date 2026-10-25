from django.urls import reverse

from book_admin.models import ActivityLog, FlagCategory, Notification
from book_admin.tests.helpers import AdminApiTestCase, make_book
from book_admin.urls import urlpatterns as admin_urlpatterns
from inventory.constants import BookStatus
from inventory.models import Shelf

DUNE = {'title': 'Dune', 'author': 'Frank Herbert'}


class StaffRefusedEverywhereTests(AdminApiTestCase):
    def test_staff_cannot_call_any_admin_route_with_any_method(self):
        book = make_book(self.staff, self.a01)
        self.sign_in_as(self.staff)
        for pattern in admin_urlpatterns:
            kwargs = {name: book.id if conv.__class__.__name__ == 'IntConverter' else 'A-01' for name, conv in pattern.pattern.converters.items()}
            url = reverse(f'book_admin:{pattern.name}', kwargs=kwargs)
            for method in ('get', 'post', 'patch', 'put', 'delete'):
                self.assertEqual(getattr(self.client, method)(url, {}, format='json').status_code, 403, f'{method.upper()} {url}')
        book.refresh_from_db()
        self.assertEqual(book.status, BookStatus.PENDING)  # nothing changed
        self.assertTrue(Shelf.objects.filter(code='A-01').exists())


class RejectWithWaitersTests(AdminApiTestCase):
    def reject(self, book):
        response = self.client.post(reverse('book_admin:book-reject', args=[book.id]), {'reason': 'Damaged book'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)

    def test_rejecting_the_primary_makes_the_oldest_waiter_pending_and_the_rest_wait_behind_it(self):
        a03 = Shelf.objects.create(code='A-03')
        primary = make_book(self.other_staff, self.a01, **DUNE)
        first = make_book(self.staff, self.a02, **DUNE, status=BookStatus.WAITING, linked_item=primary)
        second = make_book(self.staff, a03, **DUNE, status=BookStatus.WAITING, linked_item=primary)
        self.reject(primary)
        first.refresh_from_db(), second.refresh_from_db()
        self.assertEqual((first.status, first.linked_item_id, first.match), (BookStatus.PENDING, None, None))
        self.assertEqual((second.status, second.linked_item_id, second.match['shelf_id']), (BookStatus.WAITING, first.id, 'A-02'))
        self.assertTrue(ActivityLog.objects.filter(book=first, action='Moved to pending').exists())
        self.assertTrue(ActivityLog.objects.filter(book=second, action='Waiting list updated').exists())

    def test_waiters_move_behind_another_active_copy(self):
        a03 = Shelf.objects.create(code='A-03')
        live = make_book(self.other_staff, a03, **DUNE, status=BookStatus.OUT_OF_STOCK, stock=0)
        pending = make_book(self.other_staff, self.a01, **DUNE)
        waiter = make_book(self.staff, self.a02, **DUNE, status=BookStatus.WAITING, linked_item=pending)
        self.reject(pending)
        waiter.refresh_from_db()
        self.assertEqual((waiter.status, waiter.linked_item_id), (BookStatus.WAITING, live.id))
        self.assertIsNotNone(waiter.waiting_ready_at)  # the copy it waits behind is sold out


class EditWithWaitersTests(AdminApiTestCase):
    def test_renaming_the_primary_frees_its_waiter(self):
        primary = make_book(self.other_staff, self.a01, title='Dnue', author='Frank Herbert')
        waiter = make_book(self.staff, self.a02, title='Dnue', author='Frank Herbert', status=BookStatus.WAITING, linked_item=primary)
        response = self.client.patch(reverse('book_admin:book-detail', args=[primary.id]), {'title': 'Dune'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        waiter.refresh_from_db()
        self.assertEqual((waiter.status, waiter.linked_item_id), (BookStatus.PENDING, None))

    def test_moving_the_primary_updates_the_waiters_match(self):
        a03 = Shelf.objects.create(code='A-03')
        primary = make_book(self.other_staff, self.a01, **DUNE)
        waiter = make_book(self.staff, self.a02, **DUNE, status=BookStatus.WAITING, linked_item=primary, match={'shelf_id': 'A-01'})
        response = self.client.patch(reverse('book_admin:book-detail', args=[primary.id]), {'shelf_id': 'A-03'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        waiter.refresh_from_db()
        self.assertEqual((waiter.linked_item_id, waiter.match['shelf_id']), (primary.id, a03.code))
        primary.refresh_from_db()
        self.assertEqual((primary.status, primary.linked_item_id), (BookStatus.PENDING, None))  # never waits behind itself


class WaitingApprovalTests(AdminApiTestCase):
    def approve(self, entry):
        response = self.client.post(reverse('book_admin:waiting-approve', args=[entry.id]))
        self.assertEqual(response.status_code, 200, response.data)

    def test_submitter_gets_an_approved_alert(self):
        primary = make_book(self.other_staff, self.a02, **DUNE, status=BookStatus.OUT_OF_STOCK, stock=0)
        entry = make_book(self.staff, self.a01, **DUNE, status=BookStatus.WAITING, linked_item=primary)
        self.approve(entry)
        self.assertTrue(Notification.objects.filter(type=Notification.Type.APPROVED, recipient=self.staff, book=entry).exists())

    def test_a_held_flag_is_marked_reviewed(self):
        FlagCategory.objects.create(name='Adult', mode=FlagCategory.Mode.HOLD, keywords=['erotica'], hue=10)
        title = {'title': 'Erotica Stories', 'author': 'Anon'}
        primary = make_book(self.other_staff, self.a02, **title, status=BookStatus.OUT_OF_STOCK, stock=0)
        entry = make_book(self.staff, self.a01, **title, status=BookStatus.WAITING, linked_item=primary)
        self.approve(entry)
        entry.refresh_from_db()
        self.assertEqual((entry.flag_reviewed_by_id, entry.flag_note), (self.admin.id, 'Reviewed on approval'))
        self.assertTrue(ActivityLog.objects.filter(book=entry, action='Flag reviewed').exists())


class ReadyCountTests(AdminApiTestCase):
    def test_dashboard_and_badge_count_books(self):
        a03 = Shelf.objects.create(code='A-03')
        primary = make_book(self.other_staff, self.a01, **DUNE, status=BookStatus.OUT_OF_STOCK, stock=0)
        for shelf in (self.a02, a03):
            make_book(self.staff, shelf, **DUNE, status=BookStatus.WAITING, linked_item=primary)
        dashboard = self.client.get(reverse('book_admin:dashboard')).data
        badge = self.client.get(reverse('book_admin:nav-counts')).data
        self.assertEqual((dashboard['kpis']['ready'], badge['ready']), (1, 1))
        self.assertEqual(len(dashboard['attention']['ready']), 2)  # the list still shows each entry
