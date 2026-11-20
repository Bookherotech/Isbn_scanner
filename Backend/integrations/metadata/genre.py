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


# Kids age groups (low, high, the default category name). The providers have no age field, so the age comes from clues.
_AGE_BANDS = ((0, 3, 'Age 0-3'), (4, 8, 'Age 4-8'), (9, 12, 'Age 9-12'), (13, 15, 'Age 13-15'), (16, 18, 'Age 16-18'))
assert {name for _, _, name in _AGE_BANDS} == set(GENRE_TREE['Kids'])
_AGE_RANGE = re.compile(r'\bages?\s*(\d{1,2})\s*(?:-|\u2013|to)\s*(\d{1,2})\b|\b(\d{1,2})\s*(?:-|\u2013|to)\s*(\d{1,2})\s*(?:years|yrs)\b', re.IGNORECASE)
_AGE_UP = re.compile(r'\bages?\s*(\d{1,2})\s*(?:\+|and up|& up|and over)', re.IGNORECASE)
_AGE_CLUES = (  # checked in this order; the first that matches decides
    (('board book', 'board books', 'baby', 'babies', 'toddler', 'toddlers', 'nursery rhymes'), ('Age 0-3',)),
    (('picture book', 'picture books', 'early reader', 'early readers', 'beginning reader', 'easy reader', 'readers (primary)', 'stories in rhyme'), ('Age 4-8',)),
    (('young adult', 'teen', 'teens', 'teenagers', 'ya fiction'), ('Age 13-15', 'Age 16-18')),
    (('juvenile', 'children', "children's", 'middle grade', 'chapter books'), ('Age 9-12',)),
)
_AGE_CLUE_PATTERNS = [([_pattern(k) for k in words], ages) for words, ages in _AGE_CLUES]


def _bands(low, high):
    """The age groups a range falls in. A group it only touches by one year ("8 to 12" and Age 4-8) is left out,
    unless that is all there is."""
    overlap = [(min(hi, high) - max(lo, low) + 1, name) for lo, hi, name in _AGE_BANDS if lo <= high and low <= hi]
    return [name for years, name in overlap if years >= 2] or [name for _, name in overlap]


def guess_ages(record):
    """Kids age groups for a book, from (in order): an age range written in the subjects or description ("ages 4-8",
    "8 and up"), then words like "board book", "picture book", "young adult", "juvenile", then the format / page count.
    [] when nothing points to an age."""
    text = ' | '.join([*(record.get('subjects') or []), record.get('title') or '', record.get('description') or ''])
    for match in _AGE_RANGE.finditer(text):
        low, high = (int(n) for n in (match.group(1, 2) if match.group(1) else match.group(3, 4)))
        if low <= high <= 18 and (found := _bands(low, high)):
            return found
    if match := _AGE_UP.search(text):
        low = int(match.group(1))
        if low <= 18:
            return _bands(low, low + 3)
    if 'board' in str(record.get('format') or '').lower():
        return ['Age 0-3']
    for patterns, ages in _AGE_CLUE_PATTERNS:
        if any(p.search(text) for p in patterns):
            return list(ages)
    pages = record.get('pages')
    if isinstance(pages, int) and 0 < pages <= 40:
        return ['Age 4-8']  # a very short book: most likely a picture book
    return []


def add_guesses(record):
    """Set record['genre'], ['subgenres'], ['language'] and ['ages'] (the Kids age groups, kept even when the genre is
    not Kids, so picking Kids by hand can tick them) from the title, subjects, description, format, pages and language."""
    record['genre'] = guess_genre(record.get('title'), record.get('subjects'))
    record['ages'] = guess_ages(record)
    if record['genre'] == 'Kids':
        record['subgenres'] = list(record['ages'])
    else:
        record['subgenres'] = guess_subgenres(record['genre'], record.get('title'), record.get('subjects'))
    record['language'] = guess_language(record.get('title'), record.get('language'))
    return record
