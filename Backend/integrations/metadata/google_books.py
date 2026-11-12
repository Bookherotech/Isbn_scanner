"""Google Books: https://developers.google.com/books/docs/v1/using (needs a key: keyless requests have a 0 daily quota)."""

from integrations.metadata.http import get_json
from integrations.metadata.parsing import clean_subjects, https, positive_int, year_from

URL = 'https://www.googleapis.com/books/v1/volumes'
SOURCE = 'google'
SEARCH_FETCH = 10  # results asked from Google; after filtering, `limit` are returned


def _details(info):
    """volumeInfo -> our fields (without the ISBN)."""
    return {
        'title': str(info.get('title') or '').strip(),
        'author': ', '.join(str(a).strip() for a in info.get('authors') or [] if str(a).strip()),
        'publisher': str(info.get('publisher') or '').strip(),
        'year': year_from(info.get('publishedDate')),
        'pages': positive_int(info.get('pageCount')),
        'subjects': clean_subjects(info.get('categories') or []),
        'cover_url': https((info.get('imageLinks') or {}).get('thumbnail')),
        'description': str(info.get('description') or '').strip(),
    }


def fetch(isbn13, *, api_key='', timeout=5):
    """The record for an ISBN-13, or None when Google has none. Raises ProviderError on failure."""
    params = {'q': f'isbn:{isbn13}', 'maxResults': 1, 'printType': 'books'}
    if api_key:
        params['key'] = api_key
    data = get_json(URL, params, timeout)
    items = data.get('items') or []
    if not items:
        return None
    details = _details(items[0].get('volumeInfo') or {})
    if not details['title']:
        return None
    return {'isbn': isbn13, **details, 'source': SOURCE}


def search(text, *, api_key='', timeout=5, limit=5):
    """Free-text search (e.g. a typed title) -> up to `limit` candidate books for staff to choose from.

    Results carry no ISBN on purpose: a match is usually another edition, and the scanned ISBN must be kept.
    Entries without a title or author are skipped, and repeats of the same title/author/publisher/year removed.
    Raises ProviderError on failure.
    """
    params = {'q': text, 'maxResults': SEARCH_FETCH, 'printType': 'books'}
    if api_key:
        params['key'] = api_key
    data = get_json(URL, params, timeout)
    results, seen = [], set()
    for item in data.get('items') or []:
        details = _details(item.get('volumeInfo') or {})
        if not details['title'] or not details['author']:
            continue
        key = (details['title'].lower(), details['author'].lower(), details['publisher'].lower(), details['year'])
        if key in seen:
            continue
        seen.add(key)
        results.append(details)
        if len(results) == limit:
            break
    return results
