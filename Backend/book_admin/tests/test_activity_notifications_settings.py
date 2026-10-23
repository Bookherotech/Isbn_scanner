from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse

from book_admin.models import ActivityLog, Notification
from book_admin.services.activity_service import log_activity, notify
from book_admin.tests.helpers import AdminApiTestCase, make_book
from inventory.constants import BookStatus


class HookTests(AdminApiTestCase):
    def test_approve_logs_and_notifies_submitter(self):
        book = make_book(self.staff, self.a01)
        self.client.post(reverse('book_admin:book-approve', args=[book.id]))
        log = ActivityLog.objects.get(book=book)
        self.assertEqual((log.action, log.kind, log.actor_id), ('Approved', 'approval', self.admin.id))
        note = Notification.objects.get(book=book)
        self.assertEqual((note.type, note.recipient_id), ('approved', self.staff.id))

    def test_reject_logs_error_result(self):
        book = make_book(self.staff, self.a01)
        self.client.post(reverse('book_admin:book-reject', args=[book.id]), {'reason': 'Damaged book'}, format='json')
        self.assertEqual(ActivityLog.objects.get(book=book).result, 'error')
        self.assertFalse(Notification.objects.get(book=book).push)

    def test_shelf_and_settings_changes_are_logged(self):
        self.client.post(reverse('book_admin:shelf-list'), {'code': 'D-01'}, format='json')
        self.client.patch(reverse('book_admin:shelf-detail', args=['D-01']), {'status': 'inactive'}, format='json')
        self.client.patch(reverse('book_admin:settings'), {'stock_poll_minutes': 15}, format='json')
        self.assertEqual(list(ActivityLog.objects.order_by('id').values_list('action', flat=True)), ['Added shelf', 'Deactivated shelf', 'Updated settings'])


class ActivityApiTests(AdminApiTestCase):
    def test_filters_and_pages(self):
        for i in range(35):
            log_activity(action='Approved', kind='approval', target=f'Book {i}', actor=self.admin)
        log_activity(action='Auto-rejected', kind='rejection', target='Dup', actor_type='system')
        url = reverse('book_admin:activity')
        data = self.client.get(url).data
        self.assertEqual((data['total'], data['pages'], len(data['results'])), (36, 2, 30))
        self.assertEqual(data['results'][0]['actor_name'], 'System')
        self.assertEqual(self.client.get(url, {'actor': 'system'}).data['total'], 1)
        self.assertEqual(self.client.get(url, {'actor': self.admin.id, 'type': 'approval', 'q': 'book 3'}).data['total'], 6)
        self.assertEqual(self.client.get(url, {'type': 'nope'}).status_code, 400)

    def test_staff_forbidden(self):
        self.sign_in_as(self.staff)
        self.assertEqual(self.client.get(reverse('book_admin:activity')).status_code, 403)
        self.assertEqual(self.client.get(reverse('book_admin:settings')).status_code, 403)


class NotificationApiTests(AdminApiTestCase):
    def test_audiences_read_state_and_filters(self):
        notify(type='stock_out', title='Stock out', body='x', audience='all')
        notify(type='new_submission', title='New', body='x', audience='admin')
        notify(type='approved', title='Approved', body='x', recipient=self.staff)
        notify(type='approved', title='Other', body='x', recipient=self.other_staff)
        url = reverse('notifications:notification-list')
        data = self.client.get(url).data
        self.assertEqual((len(data['results']), data['unread']), (2, 2))  # admin: all + admin
        self.sign_in_as(self.staff)
        self.assertEqual({n['title'] for n in self.client.get(url).data['results']}, {'Stock out', 'Approved'})
        first = self.client.get(url).data['results'][0]['id']
        self.assertEqual(self.client.post(reverse('notifications:notification-read', args=[first])).data['unread'], 1)
        self.assertEqual(len(self.client.get(url, {'filter': 'unread'}).data['results']), 1)
        self.assertEqual(len(self.client.get(url, {'filter': 'stock'}).data['results']), 1)
        self.assertEqual(self.client.post(reverse('notifications:notification-read-all')).data['unread'], 0)
        self.assertEqual(self.client.get(reverse('notifications:notification-unread-count')).data['unread'], 0)

    def test_cannot_read_someone_elses(self):
        other = notify(type='approved', title='Other', body='x', recipient=self.other_staff)
        self.sign_in_as(self.staff)
        self.assertEqual(self.client.post(reverse('notifications:notification-read', args=[other.id])).status_code, 404)


class SettingsApiTests(AdminApiTestCase):
    def test_get_patch_validate(self):
        url = reverse('book_admin:settings')
        self.assertEqual(self.client.get(url).data['stock_poll_minutes'], 10)
        self.assertEqual(self.client.patch(url, {'store_name': 'Shop', 'reminder_after_hours': 12}, format='json').data['store_name'], 'Shop')
        self.assertEqual(self.client.patch(url, {'stock_poll_minutes': 0}, format='json').status_code, 400)
        self.assertEqual(self.client.patch(url, {'store_name': ''}, format='json').status_code, 400)


class FlatQueryTests(AdminApiTestCase):
    def test_flat(self):
        book = make_book(self.staff, self.a01, status=BookStatus.LIVE, stock=1)

        def fill(n):
            for i in range(n):
                log_activity(action='Approved', kind='approval', target=f'B{i}', actor=self.admin if i % 2 else self.staff, book=book)
                notify(type='stock_out', title='t', body='b', audience='all', book=book)

        urls = [reverse('book_admin:activity'), reverse('notifications:notification-list'), reverse('book_admin:dashboard'), reverse('book_admin:book-detail', args=[book.id])]

        def counts():
            out = []
            for u in urls:
                with CaptureQueriesContext(connection) as ctx:
                    self.assertEqual(self.client.get(u).status_code, 200)
                out.append(len(ctx.captured_queries))
            return out

        fill(1)
        few = counts()
        fill(15)
        self.assertEqual(counts(), few)
