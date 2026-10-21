"""Typed title (+ author) -> Google Books candidates, so staff can fill in a book that no ISBN lookup found."""

import hashlib
import logging
import re

from django.conf import settings
from django.core.cache import cache

from integrations.metadata import google_books
from integrations.metadata.exceptions import MetadataUnavailable, ProviderError

logger = logging.getLogger(__name__)

CACHE_SECONDS = 24 * 60 * 60


def _query(title, author):
    return re.sub(r'\s+', ' ', f'{title} {author}').strip().lower()


def search_books(title, author=''):
    """Up to 5 {title, author, publisher, year, pages, subjects, cover_url}; [] when nothing matches.

    Cached per query for 24 h. Raises MetadataUnavailable when Google cannot be reached.
    """
    query = _query(title, author)
    key = 'metadata:search:' + hashlib.sha1(query.encode('utf-8')).hexdigest()  # no spaces: safe for every cache backend
    cached = cache.get(key)
    if cached is not None:
        return cached
    try:
        results = google_books.search(query, api_key=settings.GOOGLE_BOOKS_API_KEY, timeout=settings.METADATA_TIMEOUT_SECONDS)
    except ProviderError as error:
        logger.warning('Google Books title search failed for %r: %s', query, error)
        raise MetadataUnavailable from error
    cache.set(key, results, CACHE_SECONDS)
    return results
