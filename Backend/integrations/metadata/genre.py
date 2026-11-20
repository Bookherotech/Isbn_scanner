"""A first guess of a book's main genre and language from the provider data. Staff and admins confirm or change it.

Open Library subjects and Google categories are free text ("Juvenile fiction", "Detective and mystery stories",
"Business & Economics"), so they are matched by keywords. The first genre whose keyword is found wins, so the
more specific genres (Manga, Kids...) come before the broad Fiction / Nonfiction.
"""

import re

from inventory.constants.genre import GENRES, LANGUAGES

_KEYWORDS = (
    ('Manga', ('manga',)),
    ('Graphic Novel', ('graphic novel', 'graphic novels', 'comics', 'comic books', 'comic strips')),
    ('Kids', ('juvenile', 'children', "children's", 'picture book', 'picture books', 'young adult', 'nursery rhymes', 'board books')),
    ('Education', ('textbook', 'textbooks', 'study guide', 'study guides', 'examinations', 'study and teaching', 'education', 'test preparation', 'workbooks')),
    ('Coffee Table Books', ('pictorial works', 'coffee table')),
    ('Fiction', ('fiction', 'novel', 'novels', 'short stories', 'fantasy', 'romance', 'thriller', 'thrillers', 'mystery', 'detective', 'horror', 'science fiction', 'adventure stories', 'fairy tales', 'poetry', 'drama')),
    ('Nonfiction', (
        'nonfiction', 'non-fiction', 'biography', 'autobiography', 'memoir', 'history', 'business', 'economics', 'finance', 'investing',
        'cooking', 'cookery', 'self-help', 'self help', 'personal development', 'psychology', 'philosophy', 'politics', 'political science',
        'science', 'travel', 'health', 'nutrition', 'diet', 'sports', 'art', 'architecture', 'music', 'gardening', 'marketing',
        'management', 'computers', 'information technology', 'journalism', 'encyclopedias', 'religion', 'true crime', 'essays',
    )),
)
assert all(genre in GENRES for genre, _ in _KEYWORDS)

_PATTERNS = [(genre, [re.compile(rf'(^|[^a-z0-9]){re.escape(k)}($|[^a-z0-9])', re.IGNORECASE) for k in words]) for genre, words in _KEYWORDS]

_LANGUAGE_CODES = {'ar': 'Arabic', 'ara': 'Arabic', 'fr': 'French', 'fre': 'French', 'fra': 'French', 'es': 'Spanish', 'spa': 'Spanish'}
assert set(_LANGUAGE_CODES.values()) <= set(LANGUAGES)
_ARABIC_SCRIPT = re.compile('[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]')


def guess_genre(title, subjects):
    """One of GENRES, or '' when nothing in the subjects (or title) points to one."""
    haystack = ' | '.join([*(subjects or []), title or ''])
    for genre, patterns in _PATTERNS:
        if any(p.search(haystack) for p in patterns):
            return genre
    return ''


def guess_language(title, language_code=''):
    """One of LANGUAGES, or '' (English and every other language get no tag). An Arabic-script title is Arabic."""
    if _ARABIC_SCRIPT.search(title or ''):
        return 'Arabic'
    return _LANGUAGE_CODES.get(str(language_code or '').strip().lower(), '')


def add_guesses(record):
    """Set record['genre'] and record['language'] from its title, subjects and provider language code."""
    record['genre'] = guess_genre(record.get('title'), record.get('subjects'))
    record['language'] = guess_language(record.get('title'), record.get('language'))
    return record
