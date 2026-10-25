from django.urls import reverse
from django.utils import timezone

from book_admin.models import FlagCategory
from inventory.constants import BookStatus
from staff_api.tests.helpers import StaffApiTestCase, make_book

BODY = {'isbn': '9780141182636', 'title': 'Erotica Stories', 'author': 'Anon', 'source': 'manual', 'shelf_id': 'A-01', 'quantity': 1}


class StaffFlagTests(StaffApiTestCase):
    def setUp(self):
        super().setUp()
        self.hold = FlagCategory.objects.create(name='Adult', mode=FlagCategory.Mode.HOLD, keywords=['erotica'], hue=10)

    def test_submit_returns_a_held_flag(self):
        response = self.client.post(reverse('staff_api:submissions'), BODY, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(response.data['flag_hold'])
        self.assertEqual([(f['name'], f['mode'], f['matched']) for f in response.data['flags']], [('Adult', 'hold', 'erotica')])
        self.assertEqual(response.data['item']['flags'], response.data['flags'])

    def test_list_and_detail_show_the_hold(self):
        book = make_book(self.staff, self.a01, title='Erotica Stories', author='Anon')
        row = self.client.get(reverse('staff_api:submissions')).data['results'][0]
        detail = self.client.get(reverse('staff_api:submission-detail', args=[book.id])).data
        for data in (row, detail):
            self.assertTrue(data['flag_hold'])
            self.assertEqual(data['flags'][0]['name'], 'Adult')

    def test_a_reviewed_or_approved_book_keeps_the_label_without_the_hold(self):
        reviewed = make_book(self.staff, self.a01, title='Erotica Stories', author='Anon', flag_reviewed_at=timezone.now())
        live = make_book(self.staff, self.a02, title='Erotica Tales', author='Anon', status=BookStatus.LIVE, stock=1)
        for book in (reviewed, live):
            data = self.client.get(reverse('staff_api:submission-detail', args=[book.id])).data
            self.assertEqual((data['flag_hold'], len(data['flags'])), (False, 1))

    def test_a_label_only_category_never_holds(self):
        self.hold.mode = FlagCategory.Mode.LABEL
        self.hold.save()
        response = self.client.post(reverse('staff_api:submissions'), BODY, format='json')
        self.assertEqual((response.data['flag_hold'], len(response.data['flags'])), (False, 1))

    def test_no_match_no_flags(self):
        response = self.client.post(reverse('staff_api:submissions'), {**BODY, 'title': 'Dune'}, format='json')
        self.assertEqual((response.data['flags'], response.data['flag_hold']), ([], False))
