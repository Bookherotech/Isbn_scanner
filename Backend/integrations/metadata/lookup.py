"""ISBN -> book details from the providers in settings.METADATA_PROVIDERS (in order); results are cached."""

import logging

from django.conf import settings
from django.core.cache import cache
from django.core.exceptions import ImproperlyConfigured

from integrations.metadata import google_books, open_library
from integrations.metadata.exceptions import MetadataNotFound, MetadataUnavailable, ProviderError
from integrations.metadata.parsing import same_author, same_title

logger = logging.getLogger(__name__)

CACHE_SECONDS = 24 * 60 * 60
FIELDS = ('title', 'author', 'publisher', 'year', 'pages')
FILLABLE = ('author', 'publisher', 'year', 'pages')

GOOGLE = 'google'
OPEN_LIBRARY = 'openlibrary'
PROVIDER_NAMES = {GOOGLE: 'Google Books', OPEN_LIBRARY: 'Open Library'}


def _fetch(provider, isbn13, timeout):
    if provider == GOOGLE:
        return google_books.fetch(isbn13, api_key=settings.GOOGLE_BOOKS_API_KEY, timeout=timeout)
    if provider == OPEN_LIBRARY:
        return open_library.fetch(isbn13, timeout=timeout)
    raise ImproperlyConfigured(f'Unknown METADATA_PROVIDERS entry "{provider}". Use: {", ".join(PROVIDER_NAMES)}.')


def _fill_from_google(record):
    """Fill fields the provider did not have from a Google Books title search. -> the fields filled.

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


def _cache_key(isbn13):
    return f'metadata:isbn:{isbn13}'


def cached_metadata(isbn13):
    """The last successful lookup for this ISBN, or None (no external call)."""
    return cache.get(_cache_key(isbn13))


def lookup_isbn(isbn13):
    """Book details for a valid ISBN-13.

    Returns {isbn, title, author, publisher, year, pages, subjects, cover_url, source, fallback, missing, filled}.
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
    record['filled'] = _fill_from_google(record)
    record['missing'] = [k for k in FIELDS if record.get(k) in ('', None)]
    cache.set(_cache_key(isbn13), record, CACHE_SECONDS)
    return record
