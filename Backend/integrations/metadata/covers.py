"""Where a book's cover can be downloaded from, and the download itself. Used to keep a copy on our own server."""

import re
from urllib.parse import urlparse

from integrations.metadata.http import get_image

OPEN_LIBRARY_ISBN = 'https://covers.openlibrary.org/b/isbn/{isbn}-M.jpg?default=false'  # 404 when there is no cover
ALLOWED_HOSTS = ('openlibrary.org', 'google.com', 'googleusercontent.com')  # the metadata providers' image hosts
TIMEOUT = 15  # seconds per network step: Open Library often redirects to archive.org, which is slow


def _allowed(url):
    parsed = urlparse(url)
    host = parsed.hostname or ''
    return parsed.scheme == 'https' and any(host == h or host.endswith(f'.{h}') for h in ALLOWED_HOSTS)


def cover_urls(isbn13, cover_url=''):
    """The URLs to try, best first: the one saved from the lookup (not rate limited), then Open Library by ISBN (100 per 5 min per IP)."""
    urls = [cover_url] if cover_url and _allowed(cover_url) else []
    if re.fullmatch(r'\d{13}', isbn13 or ''):
        urls.append(OPEN_LIBRARY_ISBN.format(isbn=isbn13))
    return urls


def download_cover(url):
    """The image's bytes, or None when the provider has no such cover. Raises ProviderError on failure."""
    return get_image(url, TIMEOUT)
