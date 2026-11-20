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


_UNIT_MM = {'mm': 1, 'millimeter': 1, 'millimeters': 1, 'millimetres': 1, 'cm': 10, 'centimeter': 10, 'centimeters': 10, 'centimetres': 10,
            'in': 25.4, 'inch': 25.4, 'inches': 25.4}


def book_format(value):
    """Open Library's physical_format ('paperback', 'Hardcover', 'Mass Market Paperback'...) -> a tidy label, '' when unknown."""
    text = re.sub(r'\s+', ' ', str(value or '')).strip()
    low = text.lower()
    if not low:
        return ''
    if 'hard' in low:
        return 'Hardcover'
    if 'board' in low:
        return 'Board Book'
    if 'paper' in low or 'soft' in low:
        return 'Paperback'
    return text[:40].title()


def dimensions_mm(value):
    """'19.8 x 12.9 x 2.1 centimeters' -> '129 x 198 x 21' (mm; width x height x thickness), '' when it cannot be read."""
    text = str(value or '').lower()
    numbers = [float(n) for n in re.findall(r'\d+(?:\.\d+)?', text)]
    unit = next((mm for name, mm in sorted(_UNIT_MM.items(), key=lambda kv: -len(kv[0])) if re.search(rf'\b{name}\b', text)), None)
    if len(numbers) != 3 or unit is None:
        return ''
    thickness, width, height = sorted(round(n * unit) for n in numbers)
    return f'{width} x {height} x {thickness}'
