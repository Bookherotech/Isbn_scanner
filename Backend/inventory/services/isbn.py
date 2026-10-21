"""ISBN helpers. Same rules as Frontend/src/services/isbn.js, so the client and server agree."""

import re


def clean_isbn(raw):
    """Keep digits and X only: '978-0-14-118263-6' -> '9780141182636'."""
    return re.sub(r'[^0-9X]', '', str(raw or '').upper())


def is_valid_isbn13(s):
    if not re.fullmatch(r'97[89]\d{10}', s):
        return False
    total = sum(int(s[i]) * (3 if i % 2 else 1) for i in range(12))
    return (10 - total % 10) % 10 == int(s[12])


def is_valid_isbn10(s):
    if not re.fullmatch(r'\d{9}[\dX]', s):
        return False
    total = sum((10 if c == 'X' else int(c)) * (10 - i) for i, c in enumerate(s))
    return total % 11 == 0


def isbn10_to_13(s):
    core = '978' + s[:9]
    total = sum(int(core[i]) * (3 if i % 2 else 1) for i in range(12))
    return core + str((10 - total % 10) % 10)


def to_isbn13(raw):
    """A valid ISBN-10 or ISBN-13 in any format -> the ISBN-13; anything else -> None."""
    s = clean_isbn(raw)
    if len(s) == 13:
        return s if is_valid_isbn13(s) else None
    if len(s) == 10:
        return isbn10_to_13(s) if is_valid_isbn10(s) else None
    return None
