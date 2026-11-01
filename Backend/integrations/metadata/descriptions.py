"""A book's description: Open Library by ISBN, then Google Books by title. Separate from lookup_isbn because it takes
extra calls (1-8 s), so the scan screen shows the other details first and fills this in when it arrives."""

import html
import logging
import re

from django.conf import settings
from django.core.cache import cache

from integrations.metadata import google_books, open_library
from integrations.metadata.exceptions import ProviderError
from integrations.metadata.lookup import GOOGLE, OPEN_LIBRARY, cached_metadata

logger = logging.getLogger(__name__)

MAX_LENGTH = 5000
FOUND_SECONDS = 24 * 60 * 60
NOT_FOUND_SECONDS = 60 * 60  # providers add descriptions over time; an outage is not cached at all


def clean_description(text):
    """Plain text: no HTML, no Open Library link footnotes or "also contained in" lists, at most MAX_LENGTH characters."""
    text = html.unescape(re.sub(r'<[^>]+>', ' ', str(text or '')))
    text = re.split(r'\n\s*-{3,}\s*\n', text)[0]  # Open Library: a list of editions follows the line
    text = re.sub(r'\(?\[[^\]]*\]\[\d+\]\)?', '', text)  # "([source][1])"
    text = re.sub(r'^\s*\[\d+\]:.*$', '', text, flags=re.MULTILINE)  # "[1]: http://..."
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\s*\n\s*\n\s*', '\n\n', text).strip()
    if len(text) > MAX_LENGTH:
        text = text[:MAX_LENGTH].rsplit(' ', 1)[0]
    return text


def _plain(title):
    return re.sub(r'[^a-z0-9]', '', str(title or '').lower())


def _same_title(a, b):
    """A search can return other books: accept only the same title, with or without a subtitle."""
    a, b = _plain(a), _plain(b)
    return bool(a and b) and (a.startswith(b) or b.startswith(a))


def _from_google(title, author):
    if not title:
        return ''
    results = google_books.search(f'{title} {author}'.strip(), api_key=settings.GOOGLE_BOOKS_API_KEY, timeout=settings.METADATA_TIMEOUT_SECONDS)
    return next((r['description'] for r in results if r.get('description') and _same_title(r['title'], title)), '')


def find_description(isbn13, title='', author=''):
    """{'description', 'source'} ('' for both when there is none). Never raises: the description is optional."""
    key = f'metadata:description:{isbn13}'
    cached = cache.get(key)
    if cached is not None:
        return cached

    from_lookup = (cached_metadata(isbn13) or {}).get('description')  # Google already sent it with the book
    sources = [(GOOGLE, lambda: from_lookup)] if from_lookup else []
    if OPEN_LIBRARY in settings.METADATA_PROVIDERS:
        sources.append((OPEN_LIBRARY, lambda: open_library.fetch_description(isbn13, timeout=settings.METADATA_TIMEOUT_SECONDS)))
    if GOOGLE in settings.METADATA_PROVIDERS:
        sources.append((GOOGLE, lambda: _from_google(title, author)))

    failed = False
    for source, fetch in sources:
        try:
            description = clean_description(fetch())
        except ProviderError as error:
            logger.info('%s description failed for %s: %s', source, isbn13, error)
            failed = True
            continue
        if description:
            result = {'description': description, 'source': source}
            cache.set(key, result, FOUND_SECONDS)
            return result

    result = {'description': '', 'source': ''}
    if not failed:
        cache.set(key, result, NOT_FOUND_SECONDS)
    return result
