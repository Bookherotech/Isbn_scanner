"""A copy of each book's provider cover on our own server, so screens do not wait on Open Library (1-5 s per cover).

A new submission downloads its cover in the background (cache_cover_soon); `manage.py cache_covers` on a schedule
fills in older books and retries failures. Until a copy exists, the screens load the cover from Open Library as before.
"""

import io
import logging
import threading
import time
from datetime import timedelta

from django.db import connections
from django.db.models import Q
from django.utils import timezone
from PIL import Image, UnidentifiedImageError

from integrations.metadata.covers import cover_urls, download_cover
from integrations.metadata.exceptions import ProviderError
from inventory.models import Book
from inventory.services.cover_photo import InvalidCoverPhoto, clean_image

logger = logging.getLogger(__name__)

CACHED, REUSED, NO_COVER, FAILED, SKIPPED = 'cached', 'reused', 'no_cover', 'failed', 'skipped'
RETRY_NO_COVER = timedelta(days=7)  # providers add covers over time
RETRY_FAILED = timedelta(hours=1)
BATCH = 15  # per run: at one run a minute this stays under Open Library's limit of 100 per 5 minutes
TIME_BUDGET_SECONDS = 45  # a scheduled run ends before the next one is due
MAX_FAILURES_IN_A_ROW = 3  # the provider is down or limiting us: try again on a later run
MIN_WIDTH = 11  # Open Library occasionally serves a 1x1 placeholder


def _usable(raw):
    try:
        with Image.open(io.BytesIO(raw)) as image:
            return image.width >= MIN_WIDTH
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombError):
        return False


def cache_cover(book_id):
    """Keep a copy of one book's cover. -> 'cached' | 'reused' | 'no_cover' | 'failed' | 'skipped'.

    Never called inside a transaction: a slow provider must not hold row locks.
    """
    book = Book.objects.filter(pk=book_id).first()
    if book is None or book.cover_photo or book.cached_cover:
        return SKIPPED

    same_isbn = Book.objects.filter(isbn=book.isbn).exclude(cached_cover='').values_list('cached_cover', flat=True).first()
    if same_isbn:
        Book.objects.filter(pk=book.pk, cached_cover='').update(cached_cover=same_isbn, cover_retry_at=None)
        return REUSED

    failed = False
    for url in cover_urls(book.isbn, book.cover_url):
        try:
            raw = download_cover(url)
        except ProviderError as error:
            logger.info('Cover download failed for book %s: %s', book.pk, error)
            failed = True
            continue
        if raw is None or not _usable(raw):
            continue
        try:
            image = clean_image(raw)
        except InvalidCoverPhoto:
            continue
        book.cached_cover.save(image.name, image, save=False)
        Book.objects.filter(pk=book.pk, cached_cover='').update(cached_cover=book.cached_cover.name, cover_retry_at=None)
        return CACHED

    Book.objects.filter(pk=book.pk).update(cover_retry_at=timezone.now() + (RETRY_FAILED if failed else RETRY_NO_COVER))
    return FAILED if failed else NO_COVER


def cache_cover_soon(book_id):
    """cache_cover in a background thread, so the request that saved the book does not wait. A lost thread (a restart) is
    harmless: the scheduled run picks the book up."""

    def work():
        try:
            cache_cover(book_id)
        except Exception:
            logger.exception('Could not keep a copy of the cover of book %s', book_id)
        finally:
            connections.close_all()

    threading.Thread(target=work, daemon=True, name=f'cover-{book_id}').start()


def cache_missing_covers(limit=BATCH):
    """The scheduled run: copies for books that have none yet, newest first. -> how many of each outcome."""
    due = Q(cover_retry_at__isnull=True) | Q(cover_retry_at__lte=timezone.now())
    ids = list(Book.objects.filter(due, cached_cover='', cover_photo='').order_by('-id').values_list('id', flat=True)[:limit])
    counts = {CACHED: 0, REUSED: 0, NO_COVER: 0, FAILED: 0, SKIPPED: 0}
    started, failures = time.monotonic(), 0
    for book_id in ids:
        result = cache_cover(book_id)
        counts[result] += 1
        failures = failures + 1 if result == FAILED else 0
        if failures >= MAX_FAILURES_IN_A_ROW or time.monotonic() - started > TIME_BUDGET_SECONDS:
            break
    return counts
