"""Duplicate key = normalized TITLE + AUTHOR, never ISBN (the same book from another publisher has another ISBN).

Exact port of Frontend/src/services/normalize.js: the frontend shows these normalized values to users,
so both sides must produce the same text.
"""

import re
import unicodedata


def _strip_diacritics(s):
    return re.sub('[̀-ͯ]', '', unicodedata.normalize('NFD', s))


def normalize_title(title=''):
    s = _strip_diacritics(str(title or '')).lower()
    s = s.split(':')[0]  # compare the main title only: the subtitle after ":" is dropped
    s = s.replace('&', ' and ')
    s = re.sub(r'[^a-z0-9\s]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return re.sub(r'^(the|a|an)\s+', '', s)  # ignore a leading article


def normalize_author(author=''):
    """'Fitzgerald, F. Scott' and 'F. Scott Fitzgerald' -> the same sorted token set; initials ignored."""
    s = _strip_diacritics(str(author or '')).lower()
    tokens = [t for t in re.split(r'\s+', re.sub(r'[^a-z\s]', ' ', s)) if len(t) > 1 and t != 'and']
    return ' '.join(sorted(set(tokens)))


KEY_PART_MAX = 255  # each half; "&" -> " and " can make a 255-char title longer than the column allows


def duplicate_key(title, author):
    """'title|author', at most 511 characters (fits Book.duplicate_key)."""
    return f'{normalize_title(title)[:KEY_PART_MAX].rstrip()}|{normalize_author(author)[:KEY_PART_MAX].rstrip()}'
