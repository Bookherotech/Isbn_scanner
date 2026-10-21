"""Open Library Books API: https://openlibrary.org/dev/docs/api/books (free, no key)."""

from integrations.metadata.http import get_json
from integrations.metadata.parsing import clean_subjects, positive_int, year_from

URL = 'https://openlibrary.org/api/books'
SOURCE = 'openlibrary'


def fetch(isbn13, *, timeout=5):
    """The record for an ISBN-13, or None when Open Library has none. Raises ProviderError on failure."""
    key = f'ISBN:{isbn13}'
    data = get_json(URL, {'bibkeys': key, 'format': 'json', 'jscmd': 'data'}, timeout)
    info = data.get(key) if isinstance(data, dict) else None
    if not info:
        return None
    title = str(info.get('title') or '').strip()
    if not title:
        return None
    return {
        'isbn': isbn13,
        'title': title,
        'author': ', '.join(str(a.get('name') or '').strip() for a in info.get('authors') or [] if str(a.get('name') or '').strip()),
        'publisher': ', '.join(str(p.get('name') or '').strip() for p in (info.get('publishers') or [])[:1] if str(p.get('name') or '').strip()),
        'year': year_from(info.get('publish_date')),
        'pages': positive_int(info.get('number_of_pages')),
        'subjects': clean_subjects(s.get('name') for s in info.get('subjects') or []),
        'cover_url': str((info.get('cover') or {}).get('medium') or ''),
        'source': SOURCE,
    }
