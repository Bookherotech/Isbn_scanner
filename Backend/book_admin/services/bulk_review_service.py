"""Approve all / Reject all on the Pending screen: the normal one-book review steps, once per book.

Each book has its own transaction, so one book changing meanwhile only skips that book. Books held by a content
flag stay on the Flags screen and are never included. A bulk approval leaves the Shopify work to the scheduled sync.
"""

from book_admin.exceptions import BookNotFound, InvalidState, ReviewBusy
from book_admin.services.book_queries import filter_books
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
    total = pending.count()
    done = skipped = 0
    for book_id in pending.values_list('id', flat=True)[:BULK_LIMIT]:
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
