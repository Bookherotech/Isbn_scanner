"""Approve all / Reject all on the Pending screen, and Reject all on the Flags screen: the normal one-book review steps, once per book.

Each book has its own transaction, so one book changing meanwhile only skips that book. The Pending buttons never
include books held by a content flag. A bulk approval leaves the Shopify work to the scheduled sync.
"""

from book_admin.exceptions import BookNotFound, InvalidState, ReviewBusy
from book_admin.services.book_queries import filter_books
from book_admin.services.flag_service import overview
from book_admin.services.review_service import approve_book, reject_book
from inventory.constants import BookStatus
from inventory.models import Book

BULK_LIMIT = 500  # books per request: keeps it well inside the server's request timeout
FILTERS = ('q', 'shelf', 'staff', 'source')  # the Pending screen's filters: "all" means all the books it lists


def _pending_books(filters):
    params = {k: filters.get(k, '') for k in FILTERS}
    return filter_books(Book.objects.all(), {**params, 'status': BookStatus.PENDING, 'hide_held': 'true', 'sort': 'oldest'})


def _review_all(filters, review_one):
    pending = _pending_books(filters)
    return _review_ids(pending.values_list('id', flat=True)[:BULK_LIMIT], pending.count(), review_one)


def _review_ids(ids, total, review_one):
    done = skipped = 0
    for book_id in ids:
        try:
            review_one(book_id)
            done += 1
        except (BookNotFound, InvalidState, ReviewBusy):
            skipped += 1
    return {'done': done, 'skipped': skipped, 'remaining': max(total - done - skipped, 0)}


def approve_all(filters, admin):
    """-> {done, skipped, remaining}"""
    return _review_all(filters, lambda book_id: approve_book(book_id, admin, push=False))


def reject_all(filters, admin, reason, note=''):
    """-> {done, skipped, remaining}"""
    return _review_all(filters, lambda book_id: reject_book(book_id, admin, reason, note))


def reject_all_flagged(category, admin, reason, note=''):
    """Every book in the Flags screen's "Needs review" list (only one category's, with a category id). -> {done, skipped, remaining}"""
    data = overview()
    ids = [i for i in data['review'] if not category or any(f['id'] == int(category) for f in data['flags'][i])]
    return _review_ids(ids[:BULK_LIMIT], len(ids), lambda book_id: reject_book(book_id, admin, reason, note))
