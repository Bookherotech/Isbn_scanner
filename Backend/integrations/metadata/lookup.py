"""ISBN -> book details from the providers in settings.METADATA_PROVIDERS (in order); results are cached."""

import logging
import threading
import time
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor
from concurrent.futures import wait as wait_for

from django.conf import settings
from django.core.cache import caches
from django.core.exceptions import ImproperlyConfigured

from integrations.metadata import google_books, open_library
from integrations.metadata.exceptions import MetadataNotFound, MetadataUnavailable, ProviderError
from integrations.metadata.parsing import guess_format, same_author, same_title

logger = logging.getLogger(__name__)

# Saved lookups (the `metadata` cache). A scan is answered from the saved copy; one older than STALE_SECONDS is also
# looked up again in the background, so the next scan has the provider's newer data. A copy without Google's data
# (Google failed or was slow) or without any category is kept only a day, so it is looked up again soon.
CACHE_VERSION = 2  # raise when the lookup logic changes: older saved copies are then ignored
COMPLETE_SECONDS = 30 * 24 * 60 * 60
INCOMPLETE_SECONDS = 24 * 60 * 60
STALE_SECONDS = 7 * 24 * 60 * 60
REFRESH_LOCK_SECONDS = 5 * 60
FIELDS = ('title', 'author', 'publisher', 'year', 'pages')
FILLABLE = ('author', 'publisher', 'year', 'pages')
# Filled from Google's record for the same ISBN when the answering provider (Open Library) has no value for them.
FROM_GOOGLE_ISBN = ('author', 'publisher', 'year', 'pages', 'subjects', 'cover_url', 'language')
# Filled from a Google title search (another edition) when still empty. Its categories are not marked for staff to
# verify: they only feed the genre guess, which staff confirm anyway.
TITLE_FILLABLE = (*FILLABLE, 'subjects')

GOOGLE = 'google'
OPEN_LIBRARY = 'openlibrary'
PROVIDER_NAMES = {GOOGLE: 'Google Books', OPEN_LIBRARY: 'Open Library'}


# A scan asks every provider (and Open Library's edition record) at the same time instead of one after another.
POOL = ThreadPoolExecutor(max_workers=16, thread_name_prefix='metadata')
SLOW_GRACE_SECONDS = 0.3  # the preferred provider still busy this long after another one found the book: use that one (Open Library often takes 3-20 s)
EXTRA_WAIT_SECONDS = 1.5  # how much longer the extras (format, size, Google's categories) may hold up the answer
FILL_WAIT_SECONDS = 2.0  # then the Google title fill-in and Google's full record (both already running) may take this much longer


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


def _add_subjects(record, subjects):
    """Append the subjects the record does not have yet (ignoring case)."""
    have = list(record.get('subjects') or [])
    seen = {s.lower() for s in have}
    record['subjects'] = [*have, *(s for s in subjects or [] if s.lower() not in seen)]


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
        _add_subjects(record, found.get('subjects'))
    return found.get('volume_id', '')


def _start_title_fill(record, google_job):
    """Start a Google Books title search right after the first answer (next to the same-ISBN fill and Google's full
    record, not after them), when a TITLE_FILLABLE field is empty that Google's record for the same ISBN does not have
    either (or is not back yet). -> the job, or None when nothing needs it or Google is not used."""
    if GOOGLE not in settings.METADATA_PROVIDERS:
        return None
    google = None if record['source'] == GOOGLE else _result(google_job, 0)  # only if already back: never waits
    if not any(_empty(record.get(k)) and (google is None or _empty(google.get(k))) for k in TITLE_FILLABLE):
        return None
    query = f'{record["title"]} {record.get("author") or ""}'.strip()
    return POOL.submit(google_books.search, query, api_key=settings.GOOGLE_BOOKS_API_KEY, timeout=settings.METADATA_TIMEOUT_SECONDS)


def _fill_from_google(record, job, deadline):
    """Fill the TITLE_FILLABLE fields still empty from the title search `job` (see _start_title_fill). -> the fields
    filled, without 'subjects' (the screens ask staff to verify these; the categories only feed the genre guess).

    A title match can be another edition. Its categories are taken from every matching result. A failed or slow search
    just leaves the fields empty.
    """
    empty = [k for k in TITLE_FILLABLE if _empty(record.get(k))]
    if job is None or not empty:
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
        if field == 'subjects':
            for match in matches:
                _add_subjects(record, match.get('subjects'))
            continue
        value = next((r[field] for r in matches if not _empty(r.get(field))), None)
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


def _google_extras(google_job, timeout):
    """Google's full volume record (size + full categories, see google_books.full_record), asked the moment Google's
    record for the ISBN is back, next to the rest of the lookup. NO_EXTRAS when Google has no record or failed."""
    try:
        found = google_job.result(timeout=timeout + 1)
    except Exception:  # noqa: BLE001 - Google failed or is slow: no extras
        return dict(google_books.NO_EXTRAS)
    if not found:
        return dict(google_books.NO_EXTRAS)
    return google_books.full_record(found.get('volume_id'), api_key=settings.GOOGLE_BOOKS_API_KEY, timeout=timeout)


def _add_google_extras(record, extras_job, deadline):
    """The size (when Open Library's edition record has none) and the full categories from Google's full volume
    record (extras_job, see _google_extras)."""
    extras = _result(extras_job, deadline, google_books.NO_EXTRAS)
    record.setdefault('dimensions', '')
    record['dimensions'] = record['dimensions'] or extras['dimensions']
    _add_subjects(record, extras['subjects'])


def _fill_format(record):
    """The format, when still unknown, from clues in the title / subjects / description ("board book", "Little
    Golden Book"...). Still unknown: '' (staff can type it)."""
    record.setdefault('format', '')
    record['format'] = record['format'] or guess_format(record.get('title'), record.get('subjects'), record.get('description') or '')


def _store():
    return caches['metadata']


def _cache_key(isbn13):
    return f'metadata:isbn:v{CACHE_VERSION}:{isbn13}'


def _saved(isbn13):
    """{'record', 'fetched_at' (time.time())} of the saved lookup, or None."""
    entry = _store().get(_cache_key(isbn13))
    return entry if isinstance(entry, dict) and 'record' in entry else None


def cached_metadata(isbn13):
    """The saved lookup for this ISBN, or None (no external call)."""
    entry = _saved(isbn13)
    return entry['record'] if entry else None


def _save(isbn13, record, complete):
    _store().set(_cache_key(isbn13), {'record': record, 'fetched_at': time.time()}, COMPLETE_SECONDS if complete else INCOMPLETE_SECONDS)


def _refresh_in_background(isbn13):
    """Look the book up again in a thread of its own (not POOL: the lookup itself waits on POOL jobs) and save it. One
    at a time per ISBN; a failure keeps the saved copy."""
    if not _store().add(f'metadata:refreshing:{isbn13}', 1, REFRESH_LOCK_SECONDS):
        return  # already being refreshed

    def work():
        try:
            _look_up_and_save(isbn13)
        except (MetadataNotFound, MetadataUnavailable):
            logger.info('Background refresh of %s found nothing new: the saved copy is kept', isbn13)
        except Exception:
            logger.exception('Background refresh of %s failed', isbn13)
        finally:
            _store().delete(f'metadata:refreshing:{isbn13}')

    threading.Thread(target=work, daemon=True, name=f'metadata-refresh-{isbn13}').start()


def lookup_isbn(isbn13, refresh=False):
    """Book details for a valid ISBN-13.

    Answered from the saved lookup when there is one (a copy older than STALE_SECONDS is also refreshed in the
    background for the next scan). `refresh=True` skips the saved copy and asks the providers now (the "Refresh details"
    button); the saved description is dropped too, so it is looked for again.

    Returns {isbn, title, author, publisher, year, pages, subjects, cover_url, language (the provider's code), format,
    dimensions, source, fallback, missing, filled}. Fields the first provider (Open Library) has no value for are
    filled from Google's record for the same ISBN, then from a Google title search. The providers, Open Library's
    edition record and Google's full volume record (as soon as Google's ISBN answer is back) are asked at the same
    time (see _first_answer for when a slow one is passed over); the title search starts right after the first
    answer. Categories: Open Library's subjects + Google's (search and full record), else another edition's. The
    genre is added per request: see integrations.shopify.genres.store_guess.
    `filled` lists fields that came from a Google Books title match, which staff should verify.
    `fallback` is True when Google Books failed and another provider answered instead
    (the screens then say "Google Books unavailable").
    Raises MetadataNotFound (no record anywhere) or MetadataUnavailable (a provider failed; retry later).
    """
    if refresh:
        from integrations.metadata.descriptions import forget_description  # here: descriptions imports this module

        forget_description(isbn13)
    else:
        entry = _saved(isbn13)
        if entry:
            if time.time() - entry['fetched_at'] > STALE_SECONDS:
                _refresh_in_background(isbn13)
            return entry['record']
    return _look_up_and_save(isbn13)


def _look_up_and_save(isbn13):
    """Ask the providers (see lookup_isbn) and save the result."""
    timeout = settings.METADATA_TIMEOUT_SECONDS
    providers = list(settings.METADATA_PROVIDERS)
    jobs = {provider: POOL.submit(_fetch, provider, isbn13, timeout) for provider in providers}
    edition = POOL.submit(open_library.physical, isbn13, timeout) if OPEN_LIBRARY in providers else None
    extras_job = POOL.submit(_google_extras, jobs[GOOGLE], timeout) if GOOGLE in providers else None
    record, failed = _first_answer(jobs, providers)
    if record is None and OPEN_LIBRARY in providers:
        record, failed = _ask_open_library_again(isbn13, edition, timeout, failed)

    if record is None:
        if failed:
            raise MetadataUnavailable  # a provider that failed might have it: not a confirmed "not found"
        raise MetadataNotFound

    record = dict(record)
    record['fallback'] = GOOGLE in failed and record['source'] != GOOGLE
    title_job = _start_title_fill(record, jobs.get(GOOGLE))  # now, so it runs while the rest below is waited for
    deadline = time.monotonic() + EXTRA_WAIT_SECONDS
    _add_edition(record, edition, deadline if record['source'] == OPEN_LIBRARY else 0)  # Open Library passed over as slow: only if already there
    _fill_from_google_isbn(record, jobs.get(GOOGLE), deadline)
    fill_deadline = time.monotonic() + FILL_WAIT_SECONDS
    _add_google_extras(record, extras_job, fill_deadline)
    record['filled'] = _fill_from_google(record, title_job, fill_deadline)
    _fill_format(record)
    record.pop('volume_id', None)
    record['missing'] = [k for k in FIELDS if record.get(k) in ('', None)]
    _save(isbn13, record, complete=_google_answered(jobs.get(GOOGLE), extras_job) and bool(record.get('subjects')))
    return record


def _google_answered(google_job, extras_job):
    """True when Google answered in time (with a record or a clear "none") and its full record is back too, or Google
    is not used. False when it failed or was still busy: the lookup is then kept only INCOMPLETE_SECONDS."""
    if google_job is None:
        return True
    if not google_job.done() or (extras_job is not None and not extras_job.done()):
        return False
    return not _outcome(google_job)[1]
