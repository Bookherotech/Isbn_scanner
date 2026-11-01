import re

MAX_SUBJECTS = 15


def year_from(text):
    """First 4-digit year in '2018-05-01', 'March 2018', ... -> 2018, else None."""
    found = re.search(r'\b(\d{4})\b', str(text or ''))
    return int(found.group(1)) if found else None


def positive_int(value):
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def clean_subjects(names):
    seen, out = set(), []
    for name in names:
        name = str(name or '').strip()[:100]
        if name and name.lower() not in seen:
            seen.add(name.lower())
            out.append(name)
    return out[:MAX_SUBJECTS]


def _main_title(title):
    """'Dune: Deluxe Edition (Reissue)' -> 'dune'. A subtitle is split off only at punctuation, so 'Dune Messiah' stays its own title."""
    main = re.split(r':|\(|\s[-\u2013\u2014]\s', str(title or ''), maxsplit=1)[0]
    return re.sub(r'[^a-z0-9]', '', main.lower())


def same_title(a, b):
    """A search can return other books: true only for the same title, with or without a subtitle."""
    a, b = _main_title(a), _main_title(b)
    return bool(a) and a == b


def same_author(a, b):
    """True when the two author texts share a name of 3+ letters ('Kate Atkinson' / 'K. Atkinson')."""
    names = lambda text: {w for w in re.findall(r'[a-z]+', str(text or '').lower()) if len(w) >= 3}  # noqa: E731
    return bool(names(a) & names(b))


def https(url):
    url = str(url or '')
    return 'https://' + url[len('http://'):] if url.startswith('http://') else url
