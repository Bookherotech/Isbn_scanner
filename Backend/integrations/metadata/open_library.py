"""Open Library Books API: https://openlibrary.org/dev/docs/api/books (free, no key)."""

from integrations.metadata.http import get_json
from integrations.metadata.exceptions import ProviderError
from integrations.metadata.parsing import book_format, clean_subjects, dimensions_mm, positive_int, year_from

URL = 'https://openlibrary.org/api/books'
SOURCE = 'openlibrary'


def fetch_description(isbn13, *, timeout=5):
    """The description on the edition, else on its work; '' when there is none. Raises ProviderError on failure (a book
    Open Library does not know is a 404, so also ProviderError: the caller then tries the next provider)."""
    edition = get_json(f'https://openlibrary.org/isbn/{isbn13}.json', {}, timeout)
    description = edition.get('description')
    if not description:
        works = edition.get('works') or []
        if not works:
            return ''
        description = get_json(f'https://openlibrary.org{works[0]["key"]}.json', {}, timeout).get('description')
    return description.get('value', '') if isinstance(description, dict) else str(description or '')  # either a string or {type, value}


def physical(isbn13, timeout):
    """(format, dimensions, language code e.g. 'eng') from the edition record; the Books API data view does not have
    them. '' for each on any failure."""
    try:
        edition = get_json(f'https://openlibrary.org/isbn/{isbn13}.json', {}, timeout)
    except ProviderError:
        return '', '', ''
    languages = [lang for lang in edition.get('languages') or [] if isinstance(lang, dict)]
    language = str(languages[0].get('key') or '').rsplit('/', 1)[-1] if languages else ''
    return book_format(edition.get('physical_format')), dimensions_mm(edition.get('physical_dimensions')), language


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
        **dict(zip(('format', 'dimensions', 'language'), physical(isbn13, timeout))),
    }
