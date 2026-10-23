from django.urls import reverse
from django.utils import timezone

from book_admin.models import ActivityLog, FlagCategory, Notification
from book_admin.tests.helpers import AdminApiTestCase, make_book
from inventory.constants import BookStatus


class SubmissionSignalTests(AdminApiTestCase):
    def test_pending_submission_notifies_admins_and_logs(self):
        book = make_book(self.staff, self.a01, title='Dune', record=True)
        note = Notification.objects.get(book=book)
        self.assertEqual((note.type, note.audience, note.push), ('new_submission', 'admin', False))
        self.assertIn('Sarah submitted “Dune”', note.body)
        self.assertEqual(list(ActivityLog.objects.filter(book=book).values_list('action', flat=True)), ['Submitted'])
        feed = self.client.get(reverse('notifications:notification-list')).data
        self.assertEqual([n['type'] for n in feed['results']], ['new_submission'])
        self.sign_in_as(self.staff)  # staff do not see admin notifications
        self.assertEqual(self.client.get(reverse('notifications:notification-list')).data['results'], [])

    def test_waiting_entry_ready_when_copy_sold_out(self):
        primary = make_book(self.other_staff, self.a02, title='Dune', status=BookStatus.OUT_OF_STOCK, stock=0)
        book = make_book(self.staff, self.a01, title='Dune', status=BookStatus.WAITING, linked_item=primary, match={'shelf_id': 'A-02'},
                         waiting_ready_at=timezone.now(), record=True)
        self.assertEqual(set(Notification.objects.filter(book=book).values_list('type', flat=True)), {'waiting_created', 'waiting_ready'})
        self.assertIn('Waiting list created', ActivityLog.objects.filter(book=book).values_list('action', flat=True))

    def test_auto_rejection_is_logged_without_notification(self):
        book = make_book(self.staff, self.a01, status=BookStatus.REJECTED, auto_rejected=True, match={'shelf_id': 'A-01'}, record=True)
        self.assertEqual(set(ActivityLog.objects.filter(book=book).values_list('action', flat=True)), {'Submitted', 'Auto-rejected'})
        self.assertFalse(Notification.objects.filter(book=book).exists())

    def test_held_flag_notifies(self):
        FlagCategory.objects.create(name='Dystopia', keywords=['dystopian'], mode='hold')
        book = make_book(self.staff, self.a01, subjects=['Dystopian fiction'], record=True)
        self.assertEqual(set(Notification.objects.filter(book=book).values_list('type', flat=True)), {'new_submission', 'flagged'})

    def test_updates_do_not_notify_again(self):
        book = make_book(self.staff, self.a01, record=True)
        book.quantity = 9
        book.save()
        self.assertEqual(Notification.objects.filter(book=book).count(), 1)
