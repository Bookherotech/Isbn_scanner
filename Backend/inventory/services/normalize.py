"""Duplicate key = normalized TITLE + AUTHOR, never ISBN (the same book from another publisher has another ISBN).

Exact port of Frontend/src/services/normalize.js: the frontend shows these normalized values to users,
so both sides must produce the same text.
"""

import re
import unicodedata


def _strip_diacritics(s):
    return re.sub('[̀-ͯ]', '', unicodedata.normalize('NFD', s))


def _keep_letters(s, digits=True):
    """Any script's letters (Arabic, Hindi, Cyrillic, CJK...) and their combining marks stay; everything else is a space."""
    keep = ('L', 'M', 'N') if digits else ('L', 'M')
    return ''.join(c if c.isspace() or unicodedata.category(c)[0] in keep else ' ' for c in s)


# A subtitle that starts with "a"/"an" is a tagline ("A Novel", "A Fable About...", "An Easy Way to..."): same book, dropped.
# Any other subtitle names a different book ("Diary of a Wimpy Kid: Rodrick Rules" vs ": The Last Straw"): kept.
_TAGLINE = re.compile(r'^\s*(a|an)\s')


def normalize_title(title=''):
    raw = str(title or '')
    s = _strip_diacritics(raw).lower()
    main, sep, subtitle = s.partition(':')
    if sep and _TAGLINE.match(subtitle):
        s = main
    s = s.replace('&', ' and ')
    s = re.sub(r'\s+', ' ', _keep_letters(s)).strip()
    s = re.sub(r'^(the|a|an)\s+', '', s)  # ignore a leading article
    return s or re.sub(r'\s+', ' ', raw.lower()).strip()  # only symbols: compare as typed, never as an empty key


def normalize_author(author=''):
    """'Fitzgerald, F. Scott' and 'F. Scott Fitzgerald' -> the same sorted token set; Latin initials ignored."""
    s = _strip_diacritics(str(author or '')).lower()
    tokens = [t for t in re.split(r'\s+', _keep_letters(s, digits=False)) if (len(t) > 1 or not t.isascii()) and t != 'and']
    return ' '.join(sorted(set(tokens)))


KEY_PART_MAX = 255  # each half; "&" -> " and " can make a 255-char title longer than the column allows


def duplicate_key(title, author):
    """'title|author', at most 511 characters (fits Book.duplicate_key)."""
    return f'{normalize_title(title)[:KEY_PART_MAX].rstrip()}|{normalize_author(author)[:KEY_PART_MAX].rstrip()}'
