"""Cover photos taken by staff, and the ISBN / photo counted as edits."""

import base64
import io
import shutil
import tempfile
from unittest import mock

from django.test import override_settings
from django.urls import reverse
from PIL import Image

from inventory.models import Book
from staff_api.tests.helpers import StaffApiTestCase

FETCHED = {'title': 'The Great Gatsby', 'author': 'F. Scott Fitzgerald', 'publisher': 'Penguin', 'year': 2000, 'pages': 180, 'isbn': '9780141182636'}


def photo_data_url(size=(300, 450), fmt='JPEG', exif=True):
    image = Image.new('RGB', size, (200, 120, 40))
    out = io.BytesIO()
    extra = {}
    if exif and fmt == 'JPEG':
        data = Image.Exif()
        data[0x010F] = 'PhoneMaker'  # Make
        data[0x8825] = {1: 'N'}  # GPS info block
        extra['exif'] = data.tobytes()
    image.save(out, format=fmt, **extra)
    mime = {'JPEG': 'jpeg', 'PNG': 'png'}[fmt]
    return f'data:image/{mime};base64,' + base64.b64encode(out.getvalue()).decode()


class CoverPhotoTests(StaffApiTestCase):
    def setUp(self):
        super().setUp()
        self.media = tempfile.mkdtemp()
        override = override_settings(MEDIA_ROOT=self.media)
        override.enable()
        self.addCleanup(override.disable)
        self.addCleanup(shutil.rmtree, self.media, ignore_errors=True)
        self.url = reverse('staff_api:submissions')

    def submit(self, **overrides):
        body = {
            'isbn': '9780141182636', 'title': 'The Great Gatsby', 'author': 'F. Scott Fitzgerald', 'publisher': 'Penguin',
            'year': '2000', 'pages': '180', 'source': 'openlibrary', 'fetched': FETCHED, 'shelf_id': 'A-01', 'quantity': 1,
        }
        body.update(overrides)
        return self.client.post(self.url, body, format='json')

    def test_photo_is_saved_as_a_clean_jpeg_and_returned_as_a_full_url(self):
        response = self.submit(cover_photo=photo_data_url())
        self.assertEqual(response.status_code, 201, response.data)
        url = response.data['item']['cover_photo_url']
        self.assertTrue(url.startswith('http://testserver/media/covers/'), url)
        self.assertTrue(url.endswith('.jpg'))
        book = Book.objects.get()
        with Image.open(book.cover_photo.path) as saved:
            self.assertEqual(saved.format, 'JPEG')
            self.assertEqual(dict(saved.getexif()), {})  # phone data (maker, GPS) removed
        self.assertIn('photo', book.edited_fields)

    def test_png_is_accepted_and_large_photos_are_shrunk(self):
        self.submit(cover_photo=photo_data_url(size=(2400, 3600), fmt='PNG'))
        with Image.open(Book.objects.get().cover_photo.path) as saved:
            self.assertEqual(max(saved.size), 1600)

    def test_photo_in_list_and_detail(self):
        book_id = self.submit(cover_photo=photo_data_url()).data['item']['id']
        listed = self.client.get(self.url).data['results'][0]
        detail = self.client.get(reverse('staff_api:submission-detail', args=[book_id])).data
        self.assertTrue(listed['cover_photo_url'].startswith('http://testserver/media/covers/'))
        self.assertEqual(detail['cover_photo_url'], listed['cover_photo_url'])

    def test_no_photo_means_an_empty_url(self):
        response = self.submit()
        self.assertEqual(response.data['item']['cover_photo_url'], '')
        self.assertEqual(Book.objects.get().edited_fields, [])

    def test_manual_entry_photo_is_saved_but_not_an_edit(self):
        response = self.submit(source='manual', cover_photo=photo_data_url())
        self.assertTrue(response.data['item']['cover_photo_url'])
        self.assertEqual(Book.objects.get().edited_fields, [])

    def test_bad_uploads_are_refused_and_nothing_is_saved(self):
        not_an_image = 'data:image/png;base64,' + base64.b64encode(b'<script>alert(1)</script>').decode()
        html = 'data:text/html;base64,' + base64.b64encode(b'<h1>x</h1>').decode()
        too_big = 'data:image/jpeg;base64,' + base64.b64encode(b'\xff' * 1_600_000).decode()
        for value in (not_an_image, html, too_big, 'hello'):
            response = self.submit(cover_photo=value)
            self.assertEqual(response.status_code, 400, value[:40])
            self.assertIn('cover_photo', response.data)
        self.assertEqual(Book.objects.count(), 0)

    def test_huge_pixel_counts_are_refused(self):
        with mock.patch('inventory.services.cover_photo.MAX_PIXELS', 100):
            response = self.submit(cover_photo=photo_data_url(size=(20, 20)))
        self.assertEqual(response.status_code, 400)
        self.assertIn('cover_photo', response.data)


class EditedIsbnTests(StaffApiTestCase):
    url = reverse('staff_api:submissions')

    def submit(self, isbn, fetched_isbn):
        return self.client.post(self.url, {
            'isbn': isbn, 'title': 'The Great Gatsby', 'author': 'F. Scott Fitzgerald', 'publisher': 'Penguin', 'year': '2000',
            'pages': '180', 'source': 'openlibrary', 'fetched': {**FETCHED, 'isbn': fetched_isbn}, 'shelf_id': 'A-01', 'quantity': 1,
        }, format='json')

    def test_a_corrected_isbn_counts_as_an_edit(self):
        response = self.submit('9780743273565', '9780141182636')
        self.assertEqual(response.data['item']['edited_fields'], ['isbn'])

    def test_the_same_isbn_is_not_an_edit(self):
        self.assertEqual(self.submit('9780141182636', '9780141182636').data['item']['edited_fields'], [])

    def test_isbn10_and_isbn13_of_the_same_book_are_the_same(self):
        self.assertEqual(self.submit('9780141182636', '0141182636').data['item']['edited_fields'], [])
