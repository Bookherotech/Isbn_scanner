"""Content flags: which categories a book matches, which books wait for a flag review, and the numbers for the Flags screen.

Matching reads only the book's subjects and title, so it runs in Python over a few columns (no query per book).
"""

import re
from dataclasses import dataclass

from book_admin.models import FlagCategory
from inventory.constants import ACTIVE_STATUSES, BookStatus
from inventory.models import Book

REVIEWABLE = (BookStatus.PENDING, BookStatus.WAITING)  # only books not yet approved can be held


@dataclass
class Category:
    id: int
    name: str
    mode: str
    hue: int
    enabled: bool
    patterns: list  # [(keyword, compiled regex)]


def load_categories():
    """Every flag category, with its keywords compiled (one query)."""
    return [
        Category(c.id, c.name, c.mode, c.hue, c.enabled, [(k, re.compile(rf'(^|[^a-z0-9]){re.escape(k.strip())}($|[^a-z0-9])', re.IGNORECASE)) for k in c.keywords if k.strip()])
        for c in FlagCategory.objects.order_by('id')
    ]


def matches(title, subjects, category):
    """The first keyword of `category` found as a whole word in the subjects or title, else None."""
    haystack = ' | '.join([*(subjects or []), title or ''])
    return next((k for k, pattern in category.patterns if pattern.search(haystack)), None)


def match_flags(title, subjects, categories):
    """[{id, name, mode, hue, matched}] for the enabled categories this book matches."""
    out = []
    for c in categories:
        if c.enabled and (hit := matches(title, subjects, c)):
            out.append({'id': c.id, 'name': c.name, 'mode': c.mode, 'hue': c.hue, 'matched': hit})
    return out


def needs_review(status, reviewed_at, flags):
    """A pending / waiting book with a "hold" flag that no admin has reviewed yet."""
    return status in REVIEWABLE and reviewed_at is None and any(f['mode'] == FlagCategory.Mode.HOLD for f in flags)


def overview(categories=None):
    """One pass over the active books -> {review: [ids], reviewed: [ids], stats: {category id: {matches, awaiting}}, categories}.

    review = held, waiting for an admin; reviewed = flagged but not waiting (labelled, or already reviewed).
    stats count every category, even a disabled one ("would match"), like the Categories screen shows.
    """
    categories = load_categories() if categories is None else categories
    stats = {c.id: {'matches': 0, 'awaiting': 0} for c in categories}
    review, reviewed = [], []
    if not any(c.patterns for c in categories):
        return {'review': review, 'reviewed': reviewed, 'stats': stats, 'categories': categories, 'flags': {}}
    flags_by_book = {}
    rows = Book.objects.filter(status__in=ACTIVE_STATUSES).values_list('id', 'title', 'subjects', 'status', 'flag_reviewed_at')
    for book_id, title, subjects, status, reviewed_at in rows.iterator(chunk_size=2000):
        for c in categories:
            if matches(title, subjects, c):
                stats[c.id]['matches'] += 1
        flags = match_flags(title, subjects, categories)
        if not flags:
            continue
        flags_by_book[book_id] = flags
        if needs_review(status, reviewed_at, flags):
            review.append(book_id)
            for f in flags:
                if f['mode'] == FlagCategory.Mode.HOLD:
                    stats[f['id']]['awaiting'] += 1
        else:
            reviewed.append(book_id)
    return {'review': review, 'reviewed': reviewed, 'stats': stats, 'categories': categories, 'flags': flags_by_book}


def review_ids(categories=None):
    """Ids of the books waiting for a flag review. Reads only pending / waiting books nobody has reviewed yet
    (the admin's to-do list), never the whole catalogue; skips the read when no category holds books."""
    categories = load_categories() if categories is None else categories
    holding = [c for c in categories if c.enabled and c.mode == FlagCategory.Mode.HOLD and c.patterns]
    if not holding:
        return []
    rows = Book.objects.filter(status__in=REVIEWABLE, flag_reviewed_at__isnull=True).values_list('id', 'title', 'subjects')
    return [book_id for book_id, title, subjects in rows.iterator(chunk_size=2000) if match_flags(title, subjects, holding)]


def review_count():
    """How many books wait for a flag review (the sidebar badge)."""
    return len(review_ids())
