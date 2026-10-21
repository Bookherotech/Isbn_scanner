"""The one shared duplicate check (team rule: one implementation for the Staff and Admin modules).

Rule: same normalized title + author as an active entry
  - on the SAME shelf      -> the new entry is rejected automatically
  - on ANOTHER shelf       -> the new entry goes on the waiting list behind the "primary" entry
"""

from dataclasses import dataclass, field

from inventory.constants import ACTIVE_STATUSES, BookStatus
from inventory.models import Book
from inventory.services.normalize import duplicate_key


@dataclass
class DuplicateResult:
    key: str
    matches: list = field(default_factory=list)
    same_shelf: Book | None = None
    primary: Book | None = None  # the entry a waiting-list entry waits behind


def _waiting_primary(entry):
    """Only waiting entries match: wait behind the entry they wait for, unless it is no longer active."""
    linked = entry.linked_item
    return linked if linked is not None and linked.status in ACTIVE_STATUSES else entry


def find_duplicates(title, author, shelf_id, exclude_id=None, lock=False):
    """Active entries with the same duplicate key. `lock=True` locks them for the current transaction."""
    key = duplicate_key(title, author)
    queryset = Book.objects.filter(duplicate_key=key, status__in=ACTIVE_STATUSES).select_related('shelf', 'linked_item').order_by('id')
    if exclude_id is not None:
        queryset = queryset.exclude(id=exclude_id)
    if lock:
        queryset = queryset.select_for_update(of=('self',))
    matches = list(queryset)

    same_shelf = next((b for b in matches if b.shelf_id == shelf_id), None)
    primary = (
        next((b for b in matches if b.status in (BookStatus.LIVE, BookStatus.OUT_OF_STOCK)), None)
        or next((b for b in matches if b.status == BookStatus.PENDING), None)
        or (_waiting_primary(matches[0]) if matches else None)
    )
    return DuplicateResult(key=key, matches=matches, same_shelf=same_shelf, primary=primary)


def match_summary(book):
    """Snapshot of a matching entry, stored on the new entry and shown to staff ("Already on shelf B-03 with quantity 5")."""
    on_shopify = book.status in (BookStatus.LIVE, BookStatus.OUT_OF_STOCK)
    return {
        'item_id': book.id,
        'title': book.title,
        'author': book.author,
        'isbn': book.isbn,
        'shelf_id': book.shelf.code,
        'quantity': book.stock if on_shopify else book.quantity,
        'status': book.status,
    }
