"""A copy of each book's provider cover on our own server, so screens do not wait on Open Library (1-5 s per cover).

A new submission downloads its cover in the background (cache_cover_soon); `manage.py cache_covers` on a schedule
fills in older books and retries failures. Until a copy exists, the screens load the cover from Open Library as before.
Every size of every source is downloaded at the same time and the biggest one kept. `manage.py better_covers` does the
same for recent books saved with a narrow cover.
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

from integrations.metadata import cached_metadata
from integrations.metadata.covers import cover_urls, download_all
from inventory.models import Book
from inventory.services.cover_photo import InvalidCoverPhoto, clean_image

logger = logging.getLogger(__name__)

CACHED, REUSED, NO_COVER, FAILED, SKIPPED = 'cached', 'reused', 'no_cover', 'failed', 'skipped'
UPGRADED, KEPT = 'upgraded', 'kept'
RETRY_NO_COVER = timedelta(days=7)  # providers add covers over time
RETRY_FAILED = timedelta(hours=1)
BATCH = 15  # per run: at one run a minute this stays under Open Library's limit of 100 per 5 minutes
TIME_BUDGET_SECONDS = 45  # a scheduled run ends before the next one is due
MAX_FAILURES_IN_A_ROW = 3  # the provider is down or limiting us: try again on a later run
MIN_WIDTH = 11  # Open Library occasionally serves a 1x1 placeholder
GOOD_WIDTH = 300  # a cover at least this wide looks sharp on the store (Open Library's large size); narrower ones are re-checked by better_covers
UPGRADE_BATCH = 400  # most books better_covers re-checks per run (a day of scanning)


def _size(raw):
    """(width, height) of an image, or None when it is not a usable one."""
    try:
        with Image.open(io.BytesIO(raw)) as image:
            return (image.width, image.height) if image.width >= MIN_WIDTH else None
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombError):
        return None


def _file_width(field):
    """Width of a stored image, 0 when it cannot be read."""
    try:
        with field.open('rb') as file, Image.open(file) as image:
            return image.width
    except (OSError, ValueError, UnidentifiedImageError, Image.DecompressionBombError):
        return 0


def _best_cover(book):
    """(the biggest cover found as a clean JPEG ContentFile, its width) or (None, 0), and True if a download failed.
    Every size of every source is downloaded at the same time (see integrations.metadata.covers)."""
    more = (cached_metadata(book.isbn) or {}).get('more_covers') or []  # the other provider's cover from the scan (kept a day)
    found, failed = download_all(cover_urls(book.isbn, book.cover_url, more))
    sized = sorted(((size, raw) for _, raw in found if (size := _size(raw))), key=lambda item: item[0][0] * item[0][1], reverse=True)
    for (width, _), raw in sized:
        try:
            return clean_image(raw), width, failed
        except InvalidCoverPhoto:
            continue
    return None, 0, failed


def cache_cover(book_id):
    """Keep a copy of one book's cover: the biggest one the providers have. -> 'cached' | 'reused' | 'no_cover' |
    'failed' | 'skipped'.

    Never called inside a transaction: a slow provider must not hold row locks.
    """
    book = Book.objects.filter(pk=book_id).first()
    if book is None or book.cover_photo or book.cached_cover:
        return SKIPPED

    same_isbn = Book.objects.filter(isbn=book.isbn).exclude(cached_cover='').values_list('cached_cover', flat=True).first()
    if same_isbn:
        Book.objects.filter(pk=book.pk, cached_cover='').update(cached_cover=same_isbn, cover_retry_at=None)
        return REUSED

    image, _, failed = _best_cover(book)
    if image is not None:
        book.cached_cover.save(image.name, image, save=False)
        Book.objects.filter(pk=book.pk, cached_cover='').update(cached_cover=book.cached_cover.name, cover_retry_at=None)
        return CACHED

    if failed:
        logger.info('Cover download failed for book %s', book.pk)
    Book.objects.filter(pk=book.pk).update(cover_retry_at=timezone.now() + (RETRY_FAILED if failed else RETRY_NO_COVER))
    return FAILED if failed else NO_COVER


def upgrade_cover(book_id):
    """Swap a book's saved cover copy for a bigger one when the providers have it (books saved before covers were
    picked by size). -> 'upgraded' | 'kept' | 'skipped'. A staff photo is never replaced."""
    book = Book.objects.filter(pk=book_id).first()
    if book is None or book.cover_photo or not book.cached_cover:
        return SKIPPED
    current = _file_width(book.cached_cover)
    if current >= GOOD_WIDTH:
        return KEPT
    image, width, _ = _best_cover(book)
    if image is None or width <= current:
        return KEPT
    old = book.cached_cover.name
    book.cached_cover.save(image.name, image, save=False)
    # every book sharing the old copy (same ISBN, see cache_cover) gets the new one too
    Book.objects.filter(cached_cover=old, cover_photo='').update(cached_cover=book.cached_cover.name)
    return UPGRADED


def upgrade_recent_covers(days=1, limit=UPGRADE_BATCH):
    """upgrade_cover for books submitted in the last `days` days whose cover copy is narrow. -> how many of each outcome."""
    since = timezone.now() - timedelta(days=days)
    ids = list(Book.objects.filter(submitted_at__gte=since, cover_photo='').exclude(cached_cover='').order_by('-id').values_list('id', flat=True)[:limit])
    counts = {UPGRADED: 0, KEPT: 0, SKIPPED: 0}
    for book_id in ids:
        counts[upgrade_cover(book_id)] += 1
    return counts


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
