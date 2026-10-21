from unittest import mock

from django.urls import reverse

from integrations.metadata import MetadataNotFound, MetadataUnavailable
from staff_api.tests.helpers import StaffApiTestCase

LOOKUP = 'staff_api.views.isbn_lookup_view.lookup_isbn'
RECORD = {'isbn': '9780141182636', 'title': 'The Great Gatsby', 'author': 'F. Scott Fitzgerald', 'publisher': 'Penguin', 'year': 2000,
          'pages': 180, 'subjects': [], 'cover_url': '', 'source': 'google', 'fallback': False, 'missing': []}


def url(isbn):
    return reverse('staff_api:isbn-lookup', args=[isbn])


class IsbnLookupApiTests(StaffApiTestCase):
    def test_returns_the_record(self):
        with mock.patch(LOOKUP, return_value=RECORD) as lookup:
            response = self.client.get(url('9780141182636'))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['title'], 'The Great Gatsby')
        lookup.assert_called_once_with('9780141182636')

    def test_isbn10_is_converted_before_lookup(self):
        with mock.patch(LOOKUP, return_value=RECORD) as lookup:
            self.client.get(url('0141182636'))
        lookup.assert_called_once_with('9780141182636')

    def test_invalid_isbn(self):
        with mock.patch(LOOKUP) as lookup:
            response = self.client.get(url('9780141182637'))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'invalid_isbn')
        lookup.assert_not_called()

    def test_not_found(self):
        with mock.patch(LOOKUP, side_effect=MetadataNotFound):
            response = self.client.get(url('9781234567897'))
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data['code'], 'not_found')
        self.assertIn('detail', response.data)

    def test_service_unavailable(self):
        with mock.patch(LOOKUP, side_effect=MetadataUnavailable):
            response = self.client.get(url('9798888123454'))
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data['code'], 'service_unavailable')

    def test_staff_only(self):
        self.sign_in_as(self.admin)
        self.assertEqual(self.client.get(url('9780141182636')).status_code, 403)
        self.client.credentials()
        self.assertEqual(self.client.get(url('9780141182636')).status_code, 401)
