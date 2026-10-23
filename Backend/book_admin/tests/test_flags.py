from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse

from book_admin.models import ActivityLog, FlagCategory
from book_admin.tests.helpers import AdminApiTestCase, make_book
from inventory.constants import BookStatus


class FlagTests(AdminApiTestCase):
    def setUp(self):
        super().setUp()
        self.hold = FlagCategory.objects.create(name='Dystopia', keywords=['dystopian'], mode='hold', hue=200)
        self.label = FlagCategory.objects.create(name='Politics', keywords=['politics'], mode='label', hue=10)

    def test_matching_is_whole_word_and_uses_subjects_and_title(self):
        a = make_book(self.staff, self.a01, title='Plain', subjects=['Dystopian fiction'])
        make_book(self.staff, self.a02, title='Gaye', subjects=['gaye'], isbn='9780141182636')
        data = self.client.get(reverse('book_admin:book-detail', args=[a.id])).data
        self.assertEqual([f['name'] for f in data['flags']], ['Dystopia'])
        self.assertTrue(data['flag_hold'])
        self.assertEqual(data['flags'][0]['matched'], 'dystopian')

    def test_review_queue_counts_and_filters(self):
        held = make_book(self.staff, self.a01, title='Held', subjects=['dystopian'])
        make_book(self.staff, self.a01, title='Labelled', subjects=['Politics'])
        make_book(self.staff, self.a02, title='Clean', subjects=['cooking'])
        url = reverse('book_admin:flagged')
        data = self.client.get(url).data
        self.assertEqual(data['counts'], {'review': 1, 'reviewed': 1, 'all': 2})
        self.assertEqual([r['id'] for r in data['results']], [held.id])
        self.assertEqual(len(self.client.get(url, {'tab': 'all', 'category': self.label.id}).data['results']), 1)
        self.assertEqual(self.client.get(reverse('book_admin:nav-counts')).data['flagged'], 1)
        self.assertEqual(self.client.get(reverse('book_admin:dashboard')).data['attention']['flagged'][0]['id'], held.id)

    def test_review_then_not_held(self):
        held = make_book(self.staff, self.a01, subjects=['dystopian'])
        url = reverse('book_admin:book-flag-review', args=[held.id])
        data = self.client.post(url, {'note': 'fine'}, format='json').data
        self.assertEqual((data['flag_hold'], data['flag_note'], data['flag_reviewed_by_name']), (False, 'fine', 'Rachel Morgan'))
        self.assertEqual(self.client.post(url).status_code, 409)
        self.assertTrue(ActivityLog.objects.filter(action='Flag reviewed', book=held).exists())

    def test_approving_a_held_book_reviews_it(self):
        held = make_book(self.staff, self.a01, subjects=['dystopian'])
        self.client.post(reverse('book_admin:book-approve', args=[held.id]))
        held.refresh_from_db()
        self.assertEqual((held.status, held.flag_note), (BookStatus.LIVE, 'Reviewed on approval'))

    def test_category_crud_and_validation(self):
        url = reverse('book_admin:flag-category-list')
        response = self.client.post(url, {'name': 'Gore', 'keywords': [' Gore ', 'gore', 'blood'], 'mode': 'label'}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['keywords'], ['gore', 'blood'])
        self.assertEqual(self.client.post(url, {'name': 'gore', 'keywords': ['x'], 'mode': 'hold'}, format='json').status_code, 400)  # name taken
        self.assertEqual(self.client.post(url, {'name': 'Empty', 'keywords': [' '], 'mode': 'hold'}, format='json').status_code, 400)
        detail = reverse('book_admin:flag-category-detail', args=[self.hold.id])
        self.assertFalse(self.client.patch(detail, {'enabled': False}, format='json').data['enabled'])
        held = make_book(self.staff, self.a01, subjects=['dystopian'])
        self.assertFalse(self.client.get(reverse('book_admin:book-detail', args=[held.id])).data['flag_hold'])  # disabled: no flag

    def test_category_stats_and_staff_forbidden(self):
        make_book(self.staff, self.a01, subjects=['dystopian'])
        rows = self.client.get(reverse('book_admin:flag-category-list')).data
        dys = next(r for r in rows if r['name'] == 'Dystopia')
        self.assertEqual((dys['matches'], dys['awaiting']), (1, 1))
        self.sign_in_as(self.staff)
        self.assertEqual(self.client.get(reverse('book_admin:flagged')).status_code, 403)

    def test_flat_queries(self):
        urls = [reverse('book_admin:book-list'), reverse('book_admin:flagged'), reverse('book_admin:flag-category-list'), reverse('book_admin:dashboard')]

        def counts():
            out = []
            for u in urls:
                with CaptureQueriesContext(connection) as ctx:
                    self.assertEqual(self.client.get(u).status_code, 200)
                out.append(len(ctx.captured_queries))
            return out

        make_book(self.staff, self.a01, title='T0', subjects=['dystopian'])
        few = counts()
        for i in range(1, 15):
            make_book(self.staff, self.a01, title=f'T{i}', subjects=['dystopian', 'politics'])
        self.assertEqual(counts(), few)
