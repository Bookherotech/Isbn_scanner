"""Where a book's cover can be downloaded from, and the download itself. Used to keep a copy on our own server.

The lookup gives a medium cover (Open Library "-M", or Google's small thumbnail with a page-curl effect). The same
image also exists bigger: Open Library "-L", and Google's thumbnail without the curl at a larger width. All of them are
downloaded at the same time and the biggest usable one is kept (see inventory.services.cover_cache).
"""

import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from concurrent.futures import TimeoutError as FuturesTimeout
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from integrations.metadata.exceptions import ProviderError
from integrations.metadata.http import get_image

OPEN_LIBRARY_ISBN = 'https://covers.openlibrary.org/b/isbn/{isbn}-{size}.jpg?default=false'  # 404 when there is no cover
ALLOWED_HOSTS = ('openlibrary.org', 'google.com', 'googleusercontent.com')  # the metadata providers' image hosts
TIMEOUT = 15  # seconds per network step: Open Library often redirects to archive.org, which is slow
ALL_DOWNLOADS_SECONDS = 20  # the downloads run together; after this the best one so far is used
GOOGLE_WIDTH = 800  # Google sends its image at most this wide (never bigger than it has)
_OPEN_LIBRARY_SIZE = re.compile(r'-[SM](\.jpg)$', re.IGNORECASE)
_POOL = ThreadPoolExecutor(max_workers=12, thread_name_prefix='cover')


def _allowed(url):
    parsed = urlparse(url)
    host = parsed.hostname or ''
    return parsed.scheme == 'https' and any(host == h or host.endswith(f'.{h}') for h in ALLOWED_HOSTS)


def _larger(url):
    """The same cover in a bigger size, or None. Open Library '.../b/id/123-M.jpg' -> '-L.jpg'; Google's thumbnail
    without the page curl ('edge=curl') and at GOOGLE_WIDTH."""
    parsed = urlparse(url)
    host = parsed.hostname or ''
    if host.endswith('openlibrary.org') and _OPEN_LIBRARY_SIZE.search(parsed.path):
        return urlunparse(parsed._replace(path=_OPEN_LIBRARY_SIZE.sub(r'-L\1', parsed.path)))
    if host.endswith('google.com') and '/books/' in parsed.path:
        query = [(k, v) for k, v in parse_qsl(parsed.query) if k not in ('edge', 'fife', 'zoom')]
        return urlunparse(parsed._replace(query=urlencode([*query, ('zoom', '1'), ('fife', f'w{GOOGLE_WIDTH}')])))
    return None


def cover_urls(isbn13, cover_url='', more=()):
    """The URLs to try: bigger versions of the one saved from the lookup (and of `more`, the other provider's cover),
    those themselves, then Open Library by ISBN (100 per 5 min per IP; only when no Open Library cover is known)."""
    urls = []
    for url in dict.fromkeys([cover_url, *more]):
        if url and _allowed(url):
            bigger = _larger(url)
            urls += [bigger, url] if bigger and bigger != url else [url]
    if re.fullmatch(r'\d{13}', isbn13 or '') and not any('openlibrary.org' in u for u in urls):
        urls.append(OPEN_LIBRARY_ISBN.format(isbn=isbn13, size='L'))
    return urls


def download_cover(url):
    """The image's bytes, or None when the provider has no such cover. Raises ProviderError on failure."""
    return get_image(url, TIMEOUT)


def download_all(urls):
    """Download the URLs at the same time. -> ([(url, bytes)] of the covers found, True if any download failed).
    Covers still downloading after ALL_DOWNLOADS_SECONDS are left out."""
    jobs = {_POOL.submit(download_cover, url): url for url in urls}
    found, failed = [], False
    try:
        for job in as_completed(jobs, timeout=ALL_DOWNLOADS_SECONDS):
            try:
                raw = job.result()
            except ProviderError:
                failed = True
                continue
            if raw:
                found.append((jobs[job], raw))
    except FuturesTimeout:
        failed = True
    return found, failed
