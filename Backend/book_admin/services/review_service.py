"""Admin decisions on a book: edit, approve, reject, approve a waiting-list entry.

Each one runs in a single transaction that locks the rows it changes, so two admins (or an admin and a
staff submission) can never both act on the same book. The duplicate check is the shared one in inventory.services.
"""

from contextlib import ExitStack, contextmanager

from django.db import transaction
from django.utils import timezone

from book_admin.exceptions import BookNotFound, DuplicateSameShelf, InvalidState, NotReady, ReviewBusy
from book_admin.models import ActivityLog, Notification
from book_admin.services.activity_service import log_activity, notify, quoted
from book_admin.services.flag_service import load_categories, match_flags, needs_review
from inventory.constants import BookStatus
from inventory.models import Book
from inventory.services import DuplicateCheckBusy, duplicate_key, duplicate_key_lock, find_duplicates, match_summary

TEXT_FIELDS = ('title', 'author', 'publisher', 'year', 'pages', 'quantity')
IDENTITY_FIELDS = ('title', 'author', 'shelf_id')


def _text(value):
    return '' if value is None else str(value)


def _locked(book_id):
    """The book row, locked for this transaction (404 if it is gone)."""
    book = Book.objects.select_for_update().select_related('shelf').filter(pk=book_id).first()
    if book is None:
        raise BookNotFound
    return book


@contextmanager
def _key_locks(*keys):
    """The per-book locks for several duplicate keys, always taken in the same order (no deadlock between two admins)."""
    with ExitStack() as stack:
        for key in sorted(set(keys)):
            stack.enter_context(duplicate_key_lock(key))
        yield


def _recheck_waiters(book, why):
    """Entries waiting behind `book`, after it was rejected or its title, author or shelf changed.

    Each one runs the duplicate check again (oldest first): it waits behind the copy that is active now,
    or, when no copy is left, the first one becomes pending and the others wait behind it.
    Call inside the transaction, with the per-book lock of the old key held.
    """
    waiters = (
        Book.objects.select_for_update().select_related('shelf')
        .filter(status=BookStatus.WAITING, linked_item=book).exclude(pk=book.pk).order_by('id')
    )
    now = timezone.now()
    for entry in waiters:
        dup = find_duplicates(entry.title, entry.author, entry.shelf_id, exclude_id=entry.id, lock=True)
        # Another waiting entry is no copy to wait behind (the others still point at `book`): this one goes first.
        if dup.primary and dup.primary.status != BookStatus.WAITING:
            moved = dup.primary.id != book.id
            ready = dup.primary.status == BookStatus.OUT_OF_STOCK
            entry.linked_item, entry.match = dup.primary, match_summary(dup.primary)
            entry.waiting_ready_at = (entry.waiting_ready_at or now) if ready else None
            entry.save()
            if moved:
                log_activity(action='Waiting list updated', kind=ActivityLog.Kind.WAITING, target=quoted(entry), book=entry, result=ActivityLog.Result.INFO,
                             actor_type=ActivityLog.ActorType.SYSTEM, detail=f'{why} · now waits behind {dup.primary.shelf.code}')
        else:
            entry.status, entry.linked_item, entry.match, entry.waiting_ready_at = BookStatus.PENDING, None, None, None
            entry.save()
            log_activity(action='Moved to pending', kind=ActivityLog.Kind.WAITING, target=quoted(entry), book=entry, result=ActivityLog.Result.INFO,
                         actor_type=ActivityLog.ActorType.SYSTEM, detail=f'{why} · no other copy, ready for review')


def update_book(book_id, data, admin=None):
    """Apply an admin edit (already validated) -> (outcome, match, changes, book).

    Changing title, author or shelf of a pending / waiting entry runs the duplicate check again:
      same shelf as an active copy -> refused; other shelf -> a pending entry moves to the waiting list;
      no other copy any more -> a waiting entry moves back to pending.
    Entries waiting behind this book are checked again too (they may now wait behind another copy, or become pending).
    """
    current = Book.objects.select_related('shelf').filter(pk=book_id).first()
    if current is None:
        raise BookNotFound
    shelf = data.get('shelf_id', current.shelf)
    key = duplicate_key(data.get('title', current.title), data.get('author', current.author))
    try:
        with _key_locks(key, current.duplicate_key), transaction.atomic():
            book = _locked(book_id)
            if book.status not in (BookStatus.PENDING, BookStatus.WAITING):
                raise InvalidState('Only pending or waiting-list books can be edited.')

            new = {k: v for k, v in data.items() if k != 'shelf_id'}
            changes = [k for k, v in new.items() if _text(getattr(book, k)) != _text(v)]
            if 'shelf_id' in data and data['shelf_id'].id != book.shelf_id:
                changes.append('shelf_id')
            for field in new:
                setattr(book, field, new[field])
            book.shelf = shelf

            outcome, match = 'saved', None
            if any(c in IDENTITY_FIELDS for c in changes):
                book.duplicate_key = duplicate_key(book.title, book.author)
                dup = find_duplicates(book.title, book.author, shelf.id, exclude_id=book.id, lock=True)
                if dup.same_shelf:
                    found = match_summary(dup.same_shelf)
                    raise DuplicateSameShelf(f'Already added on Shelf {found["shelf_id"]} with quantity {found["quantity"]}.', match=found)
                if dup.primary and dup.primary.id == book.id:  # only its own waiting entries match: there is no other copy
                    dup.primary = None
                if dup.primary and book.status == BookStatus.PENDING:
                    outcome, match = 'moved_to_waiting', match_summary(dup.primary)
                    book.status, book.linked_item = BookStatus.WAITING, dup.primary
                    book.match = match
                    book.waiting_ready_at = timezone.now() if dup.primary.status == BookStatus.OUT_OF_STOCK else None
                elif dup.primary and dup.primary.id != book.linked_item_id:  # a waiting entry now waits behind a different copy
                    book.linked_item, book.match = dup.primary, match_summary(dup.primary)
                    book.waiting_ready_at = timezone.now() if dup.primary.status == BookStatus.OUT_OF_STOCK else None
                elif not dup.primary and book.status == BookStatus.WAITING:
                    outcome = 'moved_to_pending'
                    book.status, book.linked_item, book.match, book.waiting_ready_at = BookStatus.PENDING, None, None, None
            if changes:
                book.save()
                names = {'shelf_id': 'shelf', 'quantity': 'quantity'}
                log_activity(action='Edited', kind=ActivityLog.Kind.EDIT, target=quoted(book), actor=admin, book=book, result=ActivityLog.Result.INFO,
                             detail='Updated ' + ', '.join(names.get(c, c) for c in changes))
                if outcome == 'moved_to_waiting':
                    log_activity(action='Waiting list created', kind=ActivityLog.Kind.WAITING, target=quoted(book), book=book, result=ActivityLog.Result.WARNING,
                                 actor_type=ActivityLog.ActorType.SYSTEM, detail=f'{match["shelf_id"]} active · waiting on {book.shelf.code}')
                if any(c in IDENTITY_FIELDS for c in changes):
                    _recheck_waiters(book, f'{quoted(book)} was edited')
    except DuplicateCheckBusy:
        raise ReviewBusy from None
    return outcome, match, changes, book


def _mark_flag_reviewed(book, admin, note):
    book.flag_reviewed_at, book.flag_reviewed_by, book.flag_note = timezone.now(), admin, note[:255]
    log_activity(action='Flag reviewed', kind=ActivityLog.Kind.FLAG, target=quoted(book), detail=note, actor=admin, book=book)


def review_flag(book_id, admin, note=''):
    """An admin marks a held book's content flag as reviewed (it can then be approved without the hold)."""
    with transaction.atomic():
        book = _locked(book_id)
        if not needs_review(book.status, book.flag_reviewed_at, match_flags(book.title, book.subjects, load_categories())):
            raise InvalidState('This book has no content flag waiting for review.')
        _mark_flag_reviewed(book, admin, note.strip() or 'Reviewed — no action needed')
        book.save()
    return book


def approve_book(book_id, admin):
    """Pending -> live: stock starts at the counted quantity."""
    with transaction.atomic():
        book = _locked(book_id)
        if book.status != BookStatus.PENDING:
            raise InvalidState('Only pending books can be approved.')
        if needs_review(book.status, book.flag_reviewed_at, match_flags(book.title, book.subjects, load_categories())):
            _mark_flag_reviewed(book, admin, 'Reviewed on approval')  # approving a held book counts as reviewing it
        book.status = BookStatus.LIVE
        book.stock = book.quantity
        book.approved_by, book.approved_at = admin, timezone.now()
        book.save()
        log_activity(action='Approved', kind=ActivityLog.Kind.APPROVAL, target=quoted(book), detail=f'Shelf {book.shelf.code} · qty {book.quantity}', actor=admin, book=book)
        if book.submitted_by_id:
            notify(type=Notification.Type.APPROVED, title='Approved', body=f'{quoted(book)} is now live (shelf {book.shelf.code}).', recipient=book.submitted_by, book=book)
    return book


def reject_book(book_id, admin, reason, note=''):
    """Pending / waiting -> rejected by an admin. Entries waiting behind it are checked again (see _recheck_waiters)."""
    current = Book.objects.filter(pk=book_id).only('duplicate_key').first()
    if current is None:
        raise BookNotFound
    try:
        with duplicate_key_lock(current.duplicate_key), transaction.atomic():
            return _reject(book_id, admin, reason, note)
    except DuplicateCheckBusy:
        raise ReviewBusy from None


def _reject(book_id, admin, reason, note):
    book = _locked(book_id)
    if book.status not in (BookStatus.PENDING, BookStatus.WAITING):
        raise InvalidState('This entry can no longer be rejected.')
    book.status = BookStatus.REJECTED
    book.auto_rejected = False
    book.rejected_by, book.rejected_at = admin, timezone.now()
    book.reject_reason, book.reject_note = reason, note
    book.save()
    log_activity(action='Rejected', kind=ActivityLog.Kind.REJECTION, target=quoted(book), detail=reason, actor=admin, book=book, result=ActivityLog.Result.ERROR)
    if book.submitted_by_id:
        notify(type=Notification.Type.REJECTED, title='Rejected', body=f'{quoted(book)} was rejected: {reason.lower()}.', recipient=book.submitted_by, book=book, push=False)
    _recheck_waiters(book, f'Shelf {book.shelf.code} rejected')
    return book


def approve_waiting_entry(entry_id, admin):
    """The entry it waits behind sold out: that entry closes, this one goes live on the same product,
    and any other entries waiting behind the old one now wait behind this one."""
    with transaction.atomic():
        entry = _locked(entry_id)
        if entry.status != BookStatus.WAITING or entry.linked_item_id is None:
            raise InvalidState('This waiting-list entry is no longer open.')
        primary = _locked(entry.linked_item_id)
        if primary.status != BookStatus.OUT_OF_STOCK:
            left = primary.stock if primary.stock is not None else primary.quantity
            raise NotReady(f'Current stock on {primary.shelf.code} has not sold out yet ({left} left).')

        if needs_review(entry.status, entry.flag_reviewed_at, match_flags(entry.title, entry.subjects, load_categories())):
            _mark_flag_reviewed(entry, admin, 'Reviewed on approval')  # same as a normal approval

        now = timezone.now()
        primary.status, primary.closed_at = BookStatus.CLOSED, now
        primary.closed_reason = f'Sold out — active shelf switched to {entry.shelf.code}'
        primary.save()

        entry.status, entry.stock = BookStatus.LIVE, entry.quantity
        entry.approved_by, entry.approved_at = admin, now
        entry.product_id, entry.previous_shelf = primary.product_id, primary.shelf
        entry.sync_status, entry.last_sync_at = primary.sync_status, primary.last_sync_at
        entry.waiting_ready_at = entry.waiting_ready_at or now
        entry.save()

        Book.objects.filter(status=BookStatus.WAITING, linked_item=primary).update(linked_item=entry, waiting_ready_at=None)
        log_activity(action='Approved waiting entry', kind=ActivityLog.Kind.APPROVAL, target=quoted(entry), detail=f'Shelf {entry.shelf.code} · qty {entry.quantity}', actor=admin, book=entry)
        log_activity(action='Active shelf switched', kind=ActivityLog.Kind.SHELF, target=quoted(entry), detail=f'{primary.shelf.code} closed → {entry.shelf.code} active', actor=admin, book=entry)
        notify(type=Notification.Type.WAITING_APPROVED, title='Back in stock', audience=Notification.Audience.ALL, book=entry, push=False,
               body=f'{entry.title} is live again on {entry.shelf.code} — {entry.quantity} units added.')
        if entry.submitted_by_id:
            notify(type=Notification.Type.APPROVED, title='Approved', body=f'{quoted(entry)} is now live (shelf {entry.shelf.code}).', recipient=entry.submitted_by, book=entry)
    return entry, primary
