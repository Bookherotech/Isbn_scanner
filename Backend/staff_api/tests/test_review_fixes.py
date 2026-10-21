"""Fixes from the pre-PR review: per-book lock, waiting-list primary, long duplicate keys, search cache key."""

import hashlib
from unittest import mock

from django.core.cache import cache
from django.db import connection
from django.test import SimpleTestCase, override_settings
from django.urls import reverse

from integrations.metadata import search_books
from inventory.constants import BookStatus
from inventory.models import Book
from inventory.services import duplicate_key
from staff_api.tests.helpers import StaffApiTestCase, make_book

BODY = {'isbn': '9780141182636', 'title': 'Same Book', 'author': 'Same Author', 'source': 'manual', 'shelf_id': 'A-01', 'quantity': 1}


def lock_name(title, author):
    return 'bookhero:dup:' + hashlib.sha1(duplicate_key(title, author).encode('utf-8')).hexdigest()


class DuplicateLockTests(StaffApiTestCase):
    url = reverse('staff_api:submissions')

    def test_the_lock_is_released_after_a_submission(self):
        self.assertEqual(self.client.post(self.url, BODY, format='json').status_code, 201)
        with connection.cursor() as cursor:
            cursor.execute('SELECT IS_USED_LOCK(%s)', [lock_name('Same Book', 'Same Author')])
            self.assertIsNone(cursor.fetchone()[0])

    def test_a_second_submission_waits_for_the_first(self):
        """While another connection holds the book's lock, a submission of the same book is not saved."""
        other = connection.get_new_connection(connection.get_connection_params())  # a second MySQL session
        try:
            cursor = other.cursor()
            cursor.execute('SELECT GET_LOCK(%s, 0)', [lock_name('Same Book', 'Same Author')])
            self.assertEqual(cursor.fetchone()[0], 1)
            with mock.patch('inventory.services.locks.LOCK_WAIT_SECONDS', 0):
                response = self.client.post(self.url, BODY, format='json')
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.data['code'], 'busy')
            self.assertFalse(Book.objects.filter(title='Same Book').exists())
            # A different book is not blocked by that lock.
            self.assertEqual(self.client.post(self.url, {**BODY, 'title': 'Other Book'}, format='json').status_code, 201)
        finally:
            other.close()


class WaitingPrimaryTests(StaffApiTestCase):
    url = reverse('staff_api:submissions')

    def test_a_new_entry_never_waits_behind_an_inactive_entry(self):
        rejected = make_book(self.other_staff, self.a02, title='Same Book', author='Same Author', status=BookStatus.REJECTED)
        waiting = make_book(self.other_staff, self.c06, title='Same Book', author='Same Author', status=BookStatus.WAITING, linked_item=rejected)
        response = self.client.post(self.url, BODY, format='json')
        self.assertEqual(response.data['result'], 'waiting')
        self.assertEqual(response.data['item']['linked']['id'], waiting.id)  # not the rejected one

    def test_waiting_entries_still_wait_behind_an_active_entry(self):
        live = make_book(self.other_staff, self.a02, title='Same Book', author='Same Author', status=BookStatus.OUT_OF_STOCK, stock=0)
        make_book(self.other_staff, self.c06, title='Same Book', author='Same Author', status=BookStatus.WAITING, linked_item=live)
        response = self.client.post(self.url, BODY, format='json')
        self.assertEqual(response.data['item']['linked']['id'], live.id)
        self.assertTrue(response.data['ready'])


class LongTitleTests(StaffApiTestCase):
    def test_a_long_title_with_ampersands_still_saves(self):
        title = ('Cats & Dogs ' * 25)[:255]  # "&" -> " and " makes the normalized title longer than 255
        author = 'A' * 120 + ' ' + 'B' * 134
        response = self.client.post(reverse('staff_api:submissions'), {**BODY, 'title': title, 'author': author}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        key = Book.objects.get().duplicate_key
        self.assertLessEqual(len(key), 511)
        self.assertEqual(key, duplicate_key(title, author))  # the same title + author still gives the same key


@override_settings(GOOGLE_BOOKS_API_KEY='k', METADATA_TIMEOUT_SECONDS=5)
class SearchCacheKeyTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def test_the_cache_key_has_no_spaces(self):
        with mock.patch('integrations.metadata.google_books.get_json', return_value={'items': []}):
            with mock.patch('integrations.metadata.book_search.cache') as fake_cache:
                fake_cache.get.return_value = None
                search_books('Lessons in Chemistry', 'Bonnie Garmus')
        key = fake_cache.set.call_args.args[0]
        self.assertNotIn(' ', key)
        self.assertLessEqual(len(key), 250)  # memcached's limit
        self.assertEqual(key, 'metadata:search:' + hashlib.sha1(b'lessons in chemistry bonnie garmus').hexdigest())
