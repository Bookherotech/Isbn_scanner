from datetime import UTC, datetime, timedelta
from unittest import mock

from django.db import connection
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django.utils import timezone

from inventory.constants import BookStatus
from staff_api.tests.helpers import StaffApiTestCase, make_book
from staff_api.views.staff_home_view import start_of_store_day


class ShelfListApiTests(StaffApiTestCase):
    def test_lists_active_shelves_by_code(self):
        response = self.client.get(reverse('staff_api:shelves'))
        self.assertEqual(response.status_code, 200)
        self.assertEqual([s['id'] for s in response.data], ['A-01', 'A-02'])
        self.assertEqual(response.data[0], {'id': 'A-01', 'code': 'A-01', 'zone': 'A', 'status': 'active'})

    def test_staff_only(self):
        self.sign_in_as(self.admin)
        self.assertEqual(self.client.get(reverse('staff_api:shelves')).status_code, 403)


class SubmissionListApiTests(StaffApiTestCase):
    def setUp(self):
        super().setUp()
        self.url = reverse('staff_api:submissions')
        now = timezone.now()
        self.oldest = make_book(self.staff, self.a01, title='Book 1', submitted_at=now - timedelta(days=3))
        make_book(self.staff, self.a01, title='Book 2', status=BookStatus.LIVE, stock=2, submitted_at=now - timedelta(days=2))
        make_book(self.staff, self.a02, title='Book 3', status=BookStatus.REJECTED, submitted_at=now - timedelta(days=1))
        self.newest = make_book(self.staff, self.a02, title='Book 4', submitted_at=now)
        make_book(self.other_staff, self.a01, title='Not mine')

    def test_lists_own_submissions_newest_first_with_counts(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual([r['title'] for r in response.data['results']], ['Book 4', 'Book 3', 'Book 2', 'Book 1'])
        self.assertEqual(response.data['count'], 4)
        self.assertEqual(response.data['counts'], {'all': 4, 'pending': 2, 'live': 1, 'rejected': 1})

    def test_status_filter(self):
        response = self.client.get(self.url, {'status': 'pending'})
        self.assertEqual([r['title'] for r in response.data['results']], ['Book 4', 'Book 1'])
        self.assertEqual(response.data['count'], 2)
        self.assertEqual(response.data['counts']['all'], 4)  # the tab counts ignore the filter
        self.assertEqual(self.client.get(self.url, {'status': 'waiting'}).data['count'], 0)

    def test_limit(self):
        response = self.client.get(self.url, {'limit': 2})
        self.assertEqual(len(response.data['results']), 2)
        self.assertEqual(response.data['count'], 4)  # "Show more (2)"

    def test_bad_parameters(self):
        self.assertEqual(self.client.get(self.url, {'status': 'nope'}).status_code, 400)
        for limit in ('x', '0', '-3'):
            self.assertEqual(self.client.get(self.url, {'limit': limit}).status_code, 400, limit)

    def test_a_limit_above_the_maximum_is_capped_not_refused(self):
        with mock.patch('staff_api.views.submission_list_view.MAX_LIMIT', 3):
            response = self.client.get(self.url, {'limit': 504})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['results']), 3)
        self.assertEqual(response.data['count'], 4)

    def test_query_count_does_not_grow_with_rows(self):
        with CaptureQueriesContext(connection) as queries:
            self.client.get(self.url)
        # auth user + counts + rows (related rows joined) + flag categories
        self.assertLessEqual(len(queries), 4)


class SubmissionDetailApiTests(StaffApiTestCase):
    def test_own_submission(self):
        live = make_book(self.other_staff, self.a02, status=BookStatus.OUT_OF_STOCK, stock=0)
        mine = make_book(self.staff, self.a01, status=BookStatus.WAITING, linked_item=live)
        response = self.client.get(reverse('staff_api:submission-detail', args=[mine.id]))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['shelf_id'], 'A-01')
        self.assertTrue(response.data['ready'])
        self.assertEqual(response.data['linked']['shelf_id'], 'A-02')
        self.assertIsNone(response.data['approved_by_name'])

    def test_approved_and_rejected_names(self):
        approved = make_book(self.staff, self.a01, status=BookStatus.LIVE, approved_by=self.admin, approved_at=timezone.now())
        rejected = make_book(self.staff, self.a02, status=BookStatus.REJECTED, rejected_by=self.admin, rejected_at=timezone.now(), reject_reason='Damaged book')
        self.assertEqual(self.client.get(reverse('staff_api:submission-detail', args=[approved.id])).data['approved_by_name'], 'Rachel Morgan')
        data = self.client.get(reverse('staff_api:submission-detail', args=[rejected.id])).data
        self.assertEqual((data['rejected_by_name'], data['auto_rejected'], data['reject_reason']), ('Rachel Morgan', False, 'Damaged book'))

    def test_another_staff_members_submission_is_not_found(self):
        theirs = make_book(self.other_staff, self.a01)
        response = self.client.get(reverse('staff_api:submission-detail', args=[theirs.id]))
        self.assertEqual(response.status_code, 404)
        self.assertEqual(self.client.get(reverse('staff_api:submission-detail', args=[999999])).status_code, 404)


@override_settings(STORE_TIME_ZONE='Asia/Dubai')
class StaffHomeApiTests(StaffApiTestCase):
    def test_today_counts_and_recent(self):
        today = start_of_store_day()
        make_book(self.staff, self.a01, title='Today pending', submitted_at=today + timedelta(minutes=5))
        make_book(self.staff, self.a01, title='Old pending', submitted_at=today - timedelta(minutes=5))
        make_book(self.staff, self.a02, title='Approved today', status=BookStatus.LIVE, submitted_at=today - timedelta(days=2), approved_at=today + timedelta(hours=1))
        make_book(self.staff, self.a02, title='Approved before', status=BookStatus.LIVE, submitted_at=today - timedelta(days=3), approved_at=today - timedelta(hours=1))
        make_book(self.staff, self.a02, title='Waiting', status=BookStatus.WAITING, submitted_at=today - timedelta(days=4))
        make_book(self.staff, self.a02, title='Old 1', submitted_at=today - timedelta(days=5), status=BookStatus.REJECTED)
        make_book(self.other_staff, self.a01, title='Not mine', submitted_at=today + timedelta(minutes=1))

        response = self.client.get(reverse('staff_api:home'))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['today'], {'scanned': 1, 'pending': 2, 'approved': 1, 'waiting': 1})
        self.assertEqual([r['title'] for r in response.data['recent']], ['Today pending', 'Old pending', 'Approved today', 'Approved before', 'Waiting'])

    def test_store_day_starts_at_midnight_in_dubai(self):
        fixed = datetime(2026, 10, 20, 21, 30, tzinfo=UTC)  # 01:30 on 21 Oct in Dubai (UTC+4)
        with mock.patch('staff_api.views.staff_home_view.timezone.now', return_value=fixed):
            start = start_of_store_day()
        self.assertEqual(start.astimezone(UTC), datetime(2026, 10, 20, 20, 0, tzinfo=UTC))

    def test_staff_only(self):
        self.sign_in_as(self.admin)
        self.assertEqual(self.client.get(reverse('staff_api:home')).status_code, 403)
