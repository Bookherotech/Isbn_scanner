from unittest import mock
from urllib.error import URLError

from django.core.cache import cache
from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase, override_settings

from integrations.metadata import MetadataNotFound, MetadataUnavailable, ProviderError, lookup_isbn
from integrations.metadata.http import get_json

ISBN = '9780735211292'

GOOGLE_HIT = {
    'totalItems': 1,
    'items': [{'volumeInfo': {
        'title': 'Atomic Habits', 'authors': ['James Clear'], 'publisher': 'Avery', 'publishedDate': '2018-10-16',
        'pageCount': 320, 'categories': ['Self-Help', 'Self-Help'], 'imageLinks': {'thumbnail': 'http://books.google.com/x.jpg'},
    }}],
}
GOOGLE_MISS = {'totalItems': 0}
OPEN_LIBRARY_HIT = {f'ISBN:{ISBN}': {
    'title': 'Atomic Habits', 'authors': [{'name': 'James Clear'}], 'publishers': [{'name': 'Avery'}, {'name': 'Other'}],
    'publish_date': 'Oct 16, 2018', 'subjects': [{'name': 'Habits'}], 'cover': {'medium': 'https://covers.openlibrary.org/b/id/1-M.jpg'},
}}

GOOGLE = 'integrations.metadata.google_books.get_json'
OPEN_LIBRARY = 'integrations.metadata.open_library.get_json'


@override_settings(GOOGLE_BOOKS_API_KEY='', METADATA_TIMEOUT_SECONDS=5, METADATA_PROVIDERS=['google', 'openlibrary'])
class MetadataLookupTests(SimpleTestCase):
    """Order google -> openlibrary (what METADATA_PROVIDERS=google,openlibrary gives)."""

    def setUp(self):
        cache.clear()

    def test_google_record(self):
        with mock.patch(GOOGLE, return_value=GOOGLE_HIT) as google, mock.patch(OPEN_LIBRARY) as open_library:
            record = lookup_isbn(ISBN)
        google.assert_called_once()
        open_library.assert_not_called()
        self.assertEqual(record['source'], 'google')
        self.assertEqual((record['title'], record['author'], record['publisher'], record['year'], record['pages']), ('Atomic Habits', 'James Clear', 'Avery', 2018, 320))
        self.assertEqual(record['subjects'], ['Self-Help'])
        self.assertEqual(record['cover_url'], 'https://books.google.com/x.jpg')
        self.assertEqual(record['missing'], [])
        self.assertFalse(record['fallback'])

    def test_open_library_when_google_has_no_record(self):
        with mock.patch(GOOGLE, return_value=GOOGLE_MISS), mock.patch(OPEN_LIBRARY, return_value=OPEN_LIBRARY_HIT):
            record = lookup_isbn(ISBN)
        self.assertEqual(record['source'], 'openlibrary')
        self.assertFalse(record['fallback'])
        self.assertEqual(record['publisher'], 'Avery')
        self.assertEqual(record['year'], 2018)
        self.assertEqual(record['missing'], ['pages'])

    def test_open_library_when_google_fails_is_marked_as_fallback(self):
        with mock.patch(GOOGLE, side_effect=ProviderError('timed out')), mock.patch(OPEN_LIBRARY, return_value=OPEN_LIBRARY_HIT):
            record = lookup_isbn(ISBN)
        self.assertEqual(record['source'], 'openlibrary')
        self.assertTrue(record['fallback'])

    def test_not_found_anywhere(self):
        with mock.patch(GOOGLE, return_value=GOOGLE_MISS), mock.patch(OPEN_LIBRARY, return_value={}):
            with self.assertRaises(MetadataNotFound):
                lookup_isbn(ISBN)

    def test_provider_failures_are_unavailable_not_a_crash(self):
        cases = [
            (ProviderError('down'), {}),  # Google failed, Open Library has nothing: not a confirmed miss
            (GOOGLE_MISS, ProviderError('down')),
            (ProviderError('down'), ProviderError('down')),
        ]
        for google, open_library in cases:
            cache.clear()
            google_kw = {'side_effect': google} if isinstance(google, Exception) else {'return_value': google}
            ol_kw = {'side_effect': open_library} if isinstance(open_library, Exception) else {'return_value': open_library}
            with mock.patch(GOOGLE, **google_kw), mock.patch(OPEN_LIBRARY, **ol_kw):
                with self.assertRaises(MetadataUnavailable):
                    lookup_isbn(ISBN)

    def test_a_record_without_a_title_counts_as_missing(self):
        with mock.patch(GOOGLE, return_value={'items': [{'volumeInfo': {'authors': ['X']}}]}), mock.patch(OPEN_LIBRARY, return_value={}):
            with self.assertRaises(MetadataNotFound):
                lookup_isbn(ISBN)

    def test_results_are_cached(self):
        with mock.patch(GOOGLE, return_value=GOOGLE_HIT) as google:
            lookup_isbn(ISBN)
            lookup_isbn(ISBN)
        google.assert_called_once()

    @override_settings(GOOGLE_BOOKS_API_KEY='secret-key')
    def test_the_google_key_is_sent_when_set(self):
        with mock.patch(GOOGLE, return_value=GOOGLE_HIT) as google:
            lookup_isbn(ISBN)
        self.assertEqual(google.call_args.args[1]['key'], 'secret-key')


@override_settings(GOOGLE_BOOKS_API_KEY='', METADATA_TIMEOUT_SECONDS=5, METADATA_PROVIDERS=['openlibrary', 'google'])
class OpenLibraryFirstTests(SimpleTestCase):
    """The default order: openlibrary -> google."""

    def setUp(self):
        cache.clear()

    def test_open_library_answers_first_and_google_is_not_called(self):
        with mock.patch(GOOGLE) as google, mock.patch(OPEN_LIBRARY, return_value=OPEN_LIBRARY_HIT):
            record = lookup_isbn(ISBN)
        google.assert_not_called()
        self.assertEqual(record['source'], 'openlibrary')
        self.assertFalse(record['fallback'])

    def test_google_is_asked_when_open_library_has_nothing(self):
        with mock.patch(OPEN_LIBRARY, return_value={}), mock.patch(GOOGLE, return_value=GOOGLE_HIT):
            record = lookup_isbn(ISBN)
        self.assertEqual(record['source'], 'google')
        self.assertFalse(record['fallback'])  # "Google Books unavailable" must not show when Google answered

    def test_google_answering_after_an_open_library_failure_is_not_marked_as_a_google_outage(self):
        with mock.patch(OPEN_LIBRARY, side_effect=ProviderError('down')), mock.patch(GOOGLE, return_value=GOOGLE_HIT):
            record = lookup_isbn(ISBN)
        self.assertEqual(record['source'], 'google')
        self.assertFalse(record['fallback'])

    def test_not_found_and_unavailable(self):
        with mock.patch(OPEN_LIBRARY, return_value={}), mock.patch(GOOGLE, return_value=GOOGLE_MISS):
            with self.assertRaises(MetadataNotFound):
                lookup_isbn(ISBN)
        cache.clear()
        with mock.patch(OPEN_LIBRARY, side_effect=ProviderError('down')), mock.patch(GOOGLE, return_value=GOOGLE_MISS):
            with self.assertRaises(MetadataUnavailable):
                lookup_isbn(ISBN)

    @override_settings(METADATA_PROVIDERS=['openlibrary', 'amazon'])
    def test_unknown_provider_name_is_a_configuration_error(self):
        with mock.patch(OPEN_LIBRARY, return_value={}):
            with self.assertRaises(ImproperlyConfigured):
                lookup_isbn(ISBN)

    @override_settings(METADATA_PROVIDERS=['openlibrary'])
    def test_a_single_provider_works(self):
        with mock.patch(GOOGLE) as google, mock.patch(OPEN_LIBRARY, return_value={}):
            with self.assertRaises(MetadataNotFound):
                lookup_isbn(ISBN)
        google.assert_not_called()


class HttpTests(SimpleTestCase):
    def test_network_errors_become_provider_errors(self):
        for error in (URLError('no route'), TimeoutError()):
            with mock.patch('integrations.metadata.http.urlopen', side_effect=error):
                with self.assertRaises(ProviderError):
                    get_json('https://example.com', {}, 1)

    def test_bad_json_becomes_a_provider_error(self):
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = b'<html>'
        with mock.patch('integrations.metadata.http.urlopen', return_value=response):
            with self.assertRaises(ProviderError):
                get_json('https://example.com', {}, 1)
