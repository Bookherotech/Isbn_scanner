"""ISBN -> book details from the providers in settings.METADATA_PROVIDERS (in order); results are cached."""

import logging
import time
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor
from concurrent.futures import wait as wait_for

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


# A scan asks every provider (and Open Library's edition record) at the same time instead of one after another.
POOL = ThreadPoolExecutor(max_workers=16, thread_name_prefix='metadata')
SLOW_GRACE_SECONDS = 0.3  # the preferred provider still busy this long after another one found the book: use that one (Open Library often takes 3-20 s)
EXTRA_WAIT_SECONDS = 1.5  # how much longer the extras (format, size, Google's categories) may hold up the answer
FILL_WAIT_SECONDS = 2.0  # then the Google title fill-in and the size (asked at the same time) may take this much longer


def _fetch(provider, isbn13, timeout):
    """One provider's record (None = not found). Raises ProviderError (logged here) on failure."""
    if provider not in PROVIDER_NAMES:
        raise ImproperlyConfigured(f'Unknown METADATA_PROVIDERS entry "{provider}". Use: {", ".join(PROVIDER_NAMES)}.')
    try:
        if provider == GOOGLE:
            return google_books.fetch(isbn13, api_key=settings.GOOGLE_BOOKS_API_KEY, timeout=timeout)
        return open_library.fetch(isbn13, timeout=timeout, with_physical=False)  # the edition record is asked separately
    except ProviderError as error:
        logger.warning('%s lookup failed for %s: %s', PROVIDER_NAMES[provider], isbn13, error)
        raise


def _outcome(job):
    """(record or None, True if the provider failed) of a finished job. Other errors (bad settings) are raised."""
    try:
        return job.result(), False
    except ProviderError:
        return None, True


def _result(job, deadline, default=None):
    """The job's result if it finishes before `deadline` (time.monotonic) without a ProviderError, else `default`."""
    if job is None:
        return default
    wait_for([job], timeout=max(0.0, deadline - time.monotonic()))
    if not job.done():
        return default
    value, failed = _outcome(job)
    return default if failed or value is None else value


def _first_answer(jobs, providers):
    """(record, failed providers) in the order of METADATA_PROVIDERS: the first provider that has the book wins. But
    when it is still busy SLOW_GRACE_SECONDS after a later provider already found the book, the later one is used
    (a slow Open Library no longer holds up a scan Google could answer). (None, failed) when nobody has it."""
    found_at = None
    while True:
        failed, busy = [], None
        for i, provider in enumerate(providers):
            if not jobs[provider].done():
                busy = i
                break
            record, broke = _outcome(jobs[provider])
            if broke:
                failed.append(provider)
            elif record:
                return record, failed
        if busy is None:
            return None, failed
        later = next((r for r in (_outcome(jobs[p])[0] for p in providers[busy + 1:] if jobs[p].done()) if r), None)
        if later:
            found_at = found_at or time.monotonic()
            if time.monotonic() - found_at >= SLOW_GRACE_SECONDS:
                logger.info('%s was slow for %s: used %s', PROVIDER_NAMES[providers[busy]], later['isbn'], PROVIDER_NAMES[later['source']])
                return later, failed
        wait_for([j for j in jobs.values() if not j.done()], timeout=0.1 if found_at else None, return_when=FIRST_COMPLETED)


def _ask_open_library_again(isbn13, edition, timeout, failed):
    """Nobody had the book (or Open Library was too slow). Open Library adds a book it does not know yet on the first
    request for its ISBN (from its partner sources; the edition record asked at the start does that), so once that
    request is back, Open Library is asked once more. -> (record or None, failed providers)."""
    if edition is not None:
        wait_for([edition], timeout=timeout)
    try:
        record = _fetch(OPEN_LIBRARY, isbn13, timeout)
    except ProviderError:
        return None, failed
    if record:
        logger.info('Open Library had %s on the second ask', isbn13)
    return record, [p for p in failed if p != OPEN_LIBRARY]  # it answered this time: not a failure


def _empty(value):
    return value in ('', None, [])


def _fill_from_google_isbn(record, google_job, deadline):
    """Fill every field the answering provider left empty from Google's record for the same ISBN (asked at the same
    time as the other provider). -> Google's volume id ('' when Google was not asked or has no record), so the size
    lookup can skip its own search.

    Same ISBN = same edition, so these are not marked for staff to verify. A failure just leaves them empty.
    """
    if record['source'] == GOOGLE or google_job is None:
        return record.pop('volume_id', '')
    empty = [k for k in FROM_GOOGLE_ISBN if _empty(record.get(k))]
    # Also when nothing is empty: Google's categories are added to the subjects, so every category of the book is
    # there for the genre guess (Open Library often has "Fiction" only, Google "Fiction / Thrillers").
    found = _result(google_job, deadline)
    if not found:
        return ''
    if found.get('cover_url') and found['cover_url'] != record.get('cover_url'):
        record['more_covers'] = [found['cover_url']]  # Google's cover too: the saved copy is the biggest of all (inventory.services.cover_cache)
    for field in empty:
        if not _empty(found.get(field)):
            record[field] = found[field]
    if 'subjects' not in empty:
        seen = {s.lower() for s in record['subjects']}
        record['subjects'] = [*record['subjects'], *(s for s in found.get('subjects') or [] if s.lower() not in seen)]
    return found.get('volume_id', '')


def _start_title_fill(record):
    """Start a Google Books title search for the fields still empty (after the same-ISBN fill). -> (job, fields) or
    (None, []) when nothing is empty or Google is not used."""
    empty = [k for k in FILLABLE if record.get(k) in ('', None)]
    if not empty or GOOGLE not in settings.METADATA_PROVIDERS:
        return None, []
    query = f'{record["title"]} {record.get("author") or ""}'.strip()
    job = POOL.submit(google_books.search, query, api_key=settings.GOOGLE_BOOKS_API_KEY, timeout=settings.METADATA_TIMEOUT_SECONDS)
    return job, empty


def _fill_from_google(record, job, empty, deadline):
    """Fill the `empty` fields from the title search `job` (see _start_title_fill). -> the fields filled.

    A title match can be another edition, so the screens ask staff to verify these. A failed or slow search just
    leaves them empty.
    """
    if job is None:
        return []
    wait_for([job], timeout=max(0.0, deadline - time.monotonic()))
    if not job.done():
        logger.info('Google Books fill-in was slow for %s: skipped', record['isbn'])
        return []
    try:
        results = job.result()
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


def _add_edition(record, edition, deadline):
    """Format, dimensions and language from Open Library's edition record (asked at the start), where still empty."""
    record.setdefault('format', '')
    record.setdefault('dimensions', '')
    book_format, size, language = _result(edition, deadline, ('', '', ''))
    record['format'] = record['format'] or book_format
    record['dimensions'] = record['dimensions'] or size
    if _empty(record.get('language')):
        record['language'] = language


def _google_size(isbn13, google_job, timeout):
    """The size from Google's full volume record, asked as soon as Google's record for the ISBN is back (next to the
    rest of the lookup; used only when Open Library's edition record has no size). '' when Google has no record or
    no size."""
    try:
        found = google_job.result(timeout=timeout + 1)
    except Exception:  # noqa: BLE001 - Google failed or is slow: no size
        return ''
    if not found or not found.get('volume_id'):
        return ''
    return google_books.dimensions(isbn13, volume_id=found['volume_id'], api_key=settings.GOOGLE_BOOKS_API_KEY, timeout=timeout)


def _fill_physical(record, size_job, deadline):
    """Format and dimensions (for the Shopify description) when still unknown after Open Library's edition record:
    the size from Google's full volume record (size_job, see _google_size), then clues in the title / subjects /
    description for the format ("board book", "Little Golden Book"...). Whatever is still unknown stays '' (staff can
    type it)."""
    record.setdefault('format', '')
    record.setdefault('dimensions', '')
    if not record['dimensions']:
        record['dimensions'] = _result(size_job, deadline, '')
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
    filled from Google's record for the same ISBN, then from a Google title search. The providers and Open Library's
    edition record are asked at the same time (see _first_answer for when a slow one is passed over). The genre is added per request: see
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
    providers = list(settings.METADATA_PROVIDERS)
    jobs = {provider: POOL.submit(_fetch, provider, isbn13, timeout) for provider in providers}
    edition = POOL.submit(open_library.physical, isbn13, timeout) if OPEN_LIBRARY in providers else None
    size_job = POOL.submit(_google_size, isbn13, jobs[GOOGLE], timeout) if GOOGLE in providers else None
    record, failed = _first_answer(jobs, providers)
    if record is None and OPEN_LIBRARY in providers:
        record, failed = _ask_open_library_again(isbn13, edition, timeout, failed)

    if record is None:
        if failed:
            raise MetadataUnavailable  # a provider that failed might have it: not a confirmed "not found"
        raise MetadataNotFound

    record = dict(record)
    record['fallback'] = GOOGLE in failed and record['source'] != GOOGLE
    deadline = time.monotonic() + EXTRA_WAIT_SECONDS
    _add_edition(record, edition, deadline if record['source'] == OPEN_LIBRARY else 0)  # Open Library passed over as slow: only if already there
    _fill_from_google_isbn(record, jobs.get(GOOGLE), deadline)
    title_job, empty = _start_title_fill(record)  # the title search and the size lookup run at the same time
    fill_deadline = time.monotonic() + FILL_WAIT_SECONDS
    record['filled'] = _fill_from_google(record, title_job, empty, fill_deadline)
    _fill_physical(record, size_job, fill_deadline)
    record.pop('volume_id', None)
    record['missing'] = [k for k in FIELDS if record.get(k) in ('', None)]
    cache.set(_cache_key(isbn13), record, CACHE_SECONDS)
    return record
