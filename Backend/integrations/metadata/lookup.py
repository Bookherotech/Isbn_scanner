"""ISBN -> book details from the providers in settings.METADATA_PROVIDERS (in order); results are cached."""

import logging

from django.conf import settings
from django.core.cache import cache
from django.core.exceptions import ImproperlyConfigured

from integrations.metadata import google_books, open_library
from integrations.metadata.exceptions import MetadataNotFound, MetadataUnavailable, ProviderError
from integrations.metadata.parsing import guess_format, same_author, same_title

logger = logging.getLogger(__name__)

CACHE_SECONDS = 24 * 60 * 60
FIELDS = ('title', 'author', 'publisher', 'year', 'pages')
FILLABLE = ('author', 'publisher', 'year', 'pages')
# Filled from Google's record for the same ISBN when the answering provider (Open Library) has no value for them.
FROM_GOOGLE_ISBN = ('author', 'publisher', 'year', 'pages', 'subjects', 'cover_url', 'language')

GOOGLE = 'google'
OPEN_LIBRARY = 'openlibrary'
PROVIDER_NAMES = {GOOGLE: 'Google Books', OPEN_LIBRARY: 'Open Library'}


def _fetch(provider, isbn13, timeout):
    if provider == GOOGLE:
        return google_books.fetch(isbn13, api_key=settings.GOOGLE_BOOKS_API_KEY, timeout=timeout)
    if provider == OPEN_LIBRARY:
        return open_library.fetch(isbn13, timeout=timeout)
    raise ImproperlyConfigured(f'Unknown METADATA_PROVIDERS entry "{provider}". Use: {", ".join(PROVIDER_NAMES)}.')


def _empty(value):
    return value in ('', None, [])


def _fill_from_google_isbn(record):
    """Fill every field the answering provider left empty from Google's record for the same ISBN. -> Google's volume
    id ('' when Google was not asked or has no record), so the size lookup can skip its own search.

    Same ISBN = same edition, so these are not marked for staff to verify. A failure just leaves them empty.
    """
    if record['source'] == GOOGLE or GOOGLE not in settings.METADATA_PROVIDERS:
        return record.pop('volume_id', '')
    empty = [k for k in FROM_GOOGLE_ISBN if _empty(record.get(k))]
    if not empty:
        return ''
    try:
        found = google_books.fetch(record['isbn'], api_key=settings.GOOGLE_BOOKS_API_KEY, timeout=settings.METADATA_TIMEOUT_SECONDS)
    except ProviderError as error:
        logger.warning('Google Books fill-in failed for %s: %s', record['isbn'], error)
        return ''
    if not found:
        return ''
    for field in empty:
        if not _empty(found.get(field)):
            record[field] = found[field]
    return found.get('volume_id', '')


def _fill_from_google(record):
    """Fill fields still empty (after the same-ISBN fill) from a Google Books title search. -> the fields filled.

    A title match can be another edition, so the screens ask staff to verify these. A failed search just leaves them empty.
    """
    empty = [k for k in FILLABLE if record.get(k) in ('', None)]
    if not empty or GOOGLE not in settings.METADATA_PROVIDERS:
        return []
    query = f'{record["title"]} {record.get("author") or ""}'.strip()
    try:
        results = google_books.search(query, api_key=settings.GOOGLE_BOOKS_API_KEY, timeout=settings.METADATA_TIMEOUT_SECONDS)
    except ProviderError as error:
        logger.warning('Google Books fill-in failed for %s: %s', record['isbn'], error)
        return []
    matches = [r for r in results if same_title(r['title'], record['title']) and (not record.get('author') or same_author(r['author'], record['author']))]
    filled = []
    for field in empty:
        value = next((r[field] for r in matches if r.get(field) not in ('', None)), None)
        if value is not None:
            record[field] = value
            filled.append(field)
    return filled


def _fill_physical(record, volume_id=''):
    """Format and dimensions (for the Shopify description) when the answering provider had none: Open Library's
    edition record, then Google's full volume record for the size, then clues in the title / subjects / description
    for the format ("board book", "Little Golden Book"...). Whatever is still unknown stays '' (staff can type it)."""
    record.setdefault('format', '')
    record.setdefault('dimensions', '')
    timeout = settings.METADATA_TIMEOUT_SECONDS
    if record['source'] != open_library.SOURCE and OPEN_LIBRARY in settings.METADATA_PROVIDERS and not (record['format'] and record['dimensions']):
        book_format, size, _ = open_library.physical(record['isbn'], timeout)
        record['format'] = record['format'] or book_format
        record['dimensions'] = record['dimensions'] or size
    if not record['dimensions'] and GOOGLE in settings.METADATA_PROVIDERS:
        record['dimensions'] = google_books.dimensions(record['isbn'], volume_id=volume_id, api_key=settings.GOOGLE_BOOKS_API_KEY, timeout=timeout)
    record['format'] = record['format'] or guess_format(record.get('title'), record.get('subjects'), record.get('description') or '')


def _cache_key(isbn13):
    return f'metadata:isbn:{isbn13}'


def cached_metadata(isbn13):
    """The last successful lookup for this ISBN, or None (no external call)."""
    return cache.get(_cache_key(isbn13))


def lookup_isbn(isbn13):
    """Book details for a valid ISBN-13.

    Returns {isbn, title, author, publisher, year, pages, subjects, cover_url, language (the provider's code), format,
    dimensions, source, fallback, missing, filled}. Fields the first provider (Open Library) has no value for are
    filled from Google's record for the same ISBN, then from a Google title search. The genre is added per request: see
    integrations.shopify.genres.store_guess.
    `filled` lists fields that came from a Google Books title match, which staff should verify.
    `fallback` is True when Google Books failed and another provider answered instead
    (the screens then say "Google Books unavailable").
    Raises MetadataNotFound (no record anywhere) or MetadataUnavailable (a provider failed; retry later).
    """
    cached = cached_metadata(isbn13)
    if cached:
        return cached

    timeout = settings.METADATA_TIMEOUT_SECONDS
    failed = []
    record = None
    for provider in settings.METADATA_PROVIDERS:
        try:
            record = _fetch(provider, isbn13, timeout)
        except ProviderError as error:
            logger.warning('%s lookup failed for %s: %s', PROVIDER_NAMES[provider], isbn13, error)
            failed.append(provider)
            continue
        if record is not None:
            break

    if record is None:
        if failed:
            raise MetadataUnavailable  # a provider that failed might have it: not a confirmed "not found"
        raise MetadataNotFound

    record['fallback'] = GOOGLE in failed and record['source'] != GOOGLE
    volume_id = _fill_from_google_isbn(record)
    record['filled'] = _fill_from_google(record)
    _fill_physical(record, volume_id)
    record['missing'] = [k for k in FIELDS if record.get(k) in ('', None)]
    cache.set(_cache_key(isbn13), record, CACHE_SECONDS)
    return record
