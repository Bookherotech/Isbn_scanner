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


def https(url):
    url = str(url or '')
    return 'https://' + url[len('http://'):] if url.startswith('http://') else url
