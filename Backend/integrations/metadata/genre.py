"""A first guess of a book's genre, sub-categories and language from the provider data. Staff and admins confirm it.

Open Library subjects and Google categories are free text ("Juvenile fiction", "Detective and mystery stories",
"Business & Economics"), so they are matched by keywords. The first main genre whose keyword is found wins, so the
more specific genres (Manga, Kids...) come before the broad Fiction / Nonfiction. Sub-categories are then looked for
only under that genre. Names here are the defaults of inventory.constants.GENRE_TREE.
"""

import re

from inventory.constants.genre import GENRE_TREE, GENRES, LANGUAGES

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

_SUB_KEYWORDS = {
    # Fiction
    'Action': ('action',),
    'Adventure': ('adventure', 'adventure stories'),
    'Classics': ('classics', 'classic', 'classic literature'),
    'Comedy': ('humor', 'humour', 'humorous', 'comedy', 'humorous stories'),
    'Crime': ('crime', 'criminals'),
    'Drama': ('drama',),
    'General Fiction': ('fiction, general', 'fiction / general', 'general fiction', 'literary', 'literary fiction', 'contemporary'),
    'Historical': ('historical', 'historical fiction'),
    'Horror': ('horror', 'ghost stories', 'supernatural'),
    'Mystery': ('mystery', 'mysteries', 'detective', 'detective and mystery stories'),
    'Romance': ('romance', 'love stories'),
    'Sci-Fi / Science Fiction': ('science fiction', 'sci-fi', 'dystopias', 'dystopian'),
    'Thriller': ('thriller', 'thrillers', 'suspense', 'espionage'),
    # Nonfiction
    'Architecture': ('architecture',),
    'Art': ('art', 'painting', 'design'),
    'Autobiography': ('autobiography', 'memoir', 'memoirs'),
    'Biography': ('biography', 'biographies'),
    'Business': ('business', 'management', 'entrepreneurship', 'leadership', 'economics'),
    'Cooking': ('cooking', 'cookery', 'recipes', 'cookbooks'),
    'Encyclopedia': ('encyclopedia', 'encyclopedias', 'dictionaries'),
    'Finance': ('finance', 'personal finance', 'investing', 'investments', 'money'),
    'Gardening': ('gardening', 'gardens', 'plants'),
    'Health': ('health', 'medicine', 'fitness', 'mental health'),
    'History': ('history',),
    'Information Technology': ('computers', 'computer science', 'programming', 'information technology', 'software', 'internet'),
    'Journalism': ('journalism', 'reporters', 'press'),
    'Marketing': ('marketing', 'advertising', 'branding', 'sales'),
    'Music': ('music', 'musicians'),
    'Nutrition': ('nutrition', 'diet', 'diets'),
    'Philosophy': ('philosophy',),
    'Politics': ('politics', 'political science', 'government'),
    'Science': ('science', 'physics', 'chemistry', 'biology', 'astronomy', 'mathematics'),
    'Self Help': ('self-help', 'self help', 'personal development', 'motivational', 'success', 'self-improvement'),
    'Sports': ('sports', 'football', 'soccer', 'cricket', 'basketball'),
    'Travel': ('travel', 'guidebooks', 'description and travel'),
}
MAX_SUBGENRES = 3  # a guess with more than this many is noise; staff can tick more by hand

assert all(genre in GENRES for genre, _ in _KEYWORDS)
assert set(_SUB_KEYWORDS) <= {sub for subs in GENRE_TREE.values() for sub in subs}


def _pattern(keyword):
    return re.compile(rf'(^|[^a-z0-9]){re.escape(keyword)}($|[^a-z0-9])', re.IGNORECASE)


_PATTERNS = [(genre, [_pattern(k) for k in words]) for genre, words in _KEYWORDS]
_SUB_PATTERNS = {sub: [_pattern(k) for k in words] for sub, words in _SUB_KEYWORDS.items()}

_LANGUAGE_CODES = {'ar': 'Arabic', 'ara': 'Arabic', 'fr': 'French', 'fre': 'French', 'fra': 'French', 'es': 'Spanish', 'spa': 'Spanish'}
assert set(_LANGUAGE_CODES.values()) <= set(LANGUAGES)
_ARABIC_SCRIPT = re.compile('[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]')


def _haystack(title, subjects):
    return ' | '.join([*(subjects or []), title or ''])


def guess_genre(title, subjects):
    """One of GENRES, or '' when nothing in the subjects (or title) points to one."""
    text = _haystack(title, subjects)
    for genre, patterns in _PATTERNS:
        if any(p.search(text) for p in patterns):
            return genre
    return ''


def guess_subgenres(genre, title, subjects):
    """Up to MAX_SUBGENRES sub-categories of `genre` found in the subjects, in the genre's order."""
    text = _haystack(title, subjects)
    found = [sub for sub in GENRE_TREE.get(genre, ()) if any(p.search(text) for p in _SUB_PATTERNS.get(sub, ()))]
    if genre == 'Fiction' and len(found) > 1 and 'General Fiction' in found:
        found.remove('General Fiction')  # a book with a real sub-category is not "general"
    return found[:MAX_SUBGENRES]


def guess_language(title, language_code=''):
    """One of LANGUAGES, or '' (English and every other language get no tag). An Arabic-script title is Arabic."""
    if _ARABIC_SCRIPT.search(title or ''):
        return 'Arabic'
    return _LANGUAGE_CODES.get(str(language_code or '').strip().lower(), '')


def add_guesses(record):
    """Set record['genre'], ['subgenres'] and ['language'] from its title, subjects and provider language code."""
    record['genre'] = guess_genre(record.get('title'), record.get('subjects'))
    record['subgenres'] = guess_subgenres(record['genre'], record.get('title'), record.get('subjects'))
    record['language'] = guess_language(record.get('title'), record.get('language'))
    return record
