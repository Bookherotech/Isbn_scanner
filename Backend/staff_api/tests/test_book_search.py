from unittest import mock

from django.core.cache import cache
from django.test import SimpleTestCase, override_settings
from django.urls import reverse

from integrations.metadata import MetadataUnavailable, ProviderError, search_books
from staff_api.tests.helpers import StaffApiTestCase

GET_JSON = 'integrations.metadata.google_books.get_json'


def volume(title, authors=('Bonnie Garmus',), publisher='Random House', date='2025-03-01', pages=401, isbn='9780593314487'):
    return {'volumeInfo': {
        'title': title, 'authors': list(authors), 'publisher': publisher, 'publishedDate': date, 'pageCount': pages,
        'industryIdentifiers': [{'type': 'ISBN_13', 'identifier': isbn}], 'imageLinks': {'thumbnail': 'http://books.google.com/c.jpg'},
    }}


RESULTS = {'totalItems': 6, 'items': [
    volume('The First Book of Lessons in Chemistry', authors=['John Frederick Hodges'], publisher='', date='1849', pages=160),
    volume('Lessons in Chemistry'),
    volume('Lessons in Chemistry'),  # exact repeat: shown once
    volume('Summary of Lessons in Chemistry', authors=[], pages=0),  # no author: skipped
    volume('Lessons in Chemistry', publisher='Doubleday', date='2022', pages=0),  # other edition, pages unknown
]}


@override_settings(GOOGLE_BOOKS_API_KEY='k', METADATA_TIMEOUT_SECONDS=5)
class BookSearchServiceTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def test_candidates_are_parsed_filtered_and_deduplicated(self):
        with mock.patch(GET_JSON, return_value=RESULTS) as get_json:
            results = search_books('Lessons in Chem', 'garmus')
        params = get_json.call_args.args[1]
        self.assertEqual((params['q'], params['key'], params['printType']), ('lessons in chem garmus', 'k', 'books'))
        self.assertEqual([(r['title'], r['author'], r['publisher'], r['year'], r['pages']) for r in results], [
            ('The First Book of Lessons in Chemistry', 'John Frederick Hodges', '', 1849, 160),
            ('Lessons in Chemistry', 'Bonnie Garmus', 'Random House', 2025, 401),
            ('Lessons in Chemistry', 'Bonnie Garmus', 'Doubleday', 2022, None),  # pageCount 0 -> unknown
        ])
        self.assertEqual(results[1]['cover_url'], 'https://books.google.com/c.jpg')
        for r in results:
            self.assertNotIn('isbn', r)  # the scanned ISBN must always be kept

    def test_at_most_five_results(self):
        many = {'items': [volume(f'Book {i}') for i in range(10)]}
        with mock.patch(GET_JSON, return_value=many):
            self.assertEqual(len(search_books('Book')), 5)

    def test_no_results(self):
        with mock.patch(GET_JSON, return_value={'totalItems': 0}):
            self.assertEqual(search_books('zzzz qqqq'), [])

    def test_results_are_cached_per_query(self):
        with mock.patch(GET_JSON, return_value=RESULTS) as get_json:
            search_books('Lessons in Chemistry')
            search_books('  lessons   IN chemistry ')  # same query after normalizing
        get_json.assert_called_once()

    def test_google_failure_is_unavailable(self):
        with mock.patch(GET_JSON, side_effect=ProviderError('down')):
            with self.assertRaises(MetadataUnavailable):
                search_books('Lessons in Chemistry')


class BookSearchApiTests(StaffApiTestCase):
    url = reverse('staff_api:book-search')
    SEARCH = 'staff_api.views.book_search_view.search_books'

    def test_returns_results(self):
        found = [{'title': 'Lessons in Chemistry', 'author': 'Bonnie Garmus', 'publisher': 'Random House', 'year': 2025, 'pages': 401, 'subjects': [], 'cover_url': ''}]
        with mock.patch(self.SEARCH, return_value=found) as search:
            response = self.client.get(self.url, {'title': ' Lessons in Chem ', 'author': 'Garmus'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {'results': found})
        search.assert_called_once_with('Lessons in Chem', 'Garmus')

    def test_title_too_short(self):
        with mock.patch(self.SEARCH) as search:
            response = self.client.get(self.url, {'title': 'ab'})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'title_too_short')
        search.assert_not_called()

    def test_service_unavailable(self):
        with mock.patch(self.SEARCH, side_effect=MetadataUnavailable):
            response = self.client.get(self.url, {'title': 'Lessons in Chemistry'})
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data['code'], 'service_unavailable')

    def test_staff_only(self):
        self.sign_in_as(self.admin)
        self.assertEqual(self.client.get(self.url, {'title': 'Lessons'}).status_code, 403)
        self.client.credentials()
        self.assertEqual(self.client.get(self.url, {'title': 'Lessons'}).status_code, 401)

    def test_throttled_per_user(self):
        # settings: 'book_search': '30/min'
        with mock.patch(self.SEARCH, return_value=[]):
            codes = [self.client.get(self.url, {'title': f'Lessons {i}'}).status_code for i in range(31)]
        self.assertEqual(codes[:30], [200] * 30)
        self.assertEqual(codes[30], 429)
        self.sign_in_as(self.other_staff)  # the limit is per user
        with mock.patch(self.SEARCH, return_value=[]):
            self.assertEqual(self.client.get(self.url, {'title': 'Lessons'}).status_code, 200)
