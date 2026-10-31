"""Creating a book submission (the shared book-creation logic; port of submitBook in the prototype's mockApi.js)."""

from dataclasses import dataclass

from django.db import transaction
from django.utils import timezone

from inventory.constants import BookSource, BookStatus
from inventory.models import Book
from inventory.services.cover_cache import cache_cover_soon
from inventory.services.duplicate_check import find_duplicates, match_summary
from inventory.services.locks import duplicate_key_lock
from inventory.services.normalize import duplicate_key

METADATA_FIELDS = ('title', 'author', 'publisher', 'year', 'pages')
SAME_SHELF_REASON = 'Duplicate — same shelf'

PENDING = 'pending'
WAITING = 'waiting'
REJECTED = 'rejected'


@dataclass
class SubmissionResult:
    result: str  # 'pending' | 'waiting' | 'rejected'
    book: Book
    match: dict | None = None
    ready: bool = False  # waiting entry whose primary is already sold out: the admin can approve it right away


def _text(value):
    return '' if value is None else str(value)


def create_submission(*, user, shelf, isbn, title, author, publisher='', year=None, pages=None,
                      source=BookSource.MANUAL, subjects=None, fetched=None, cover_url='', cover_photo=None, quantity):
    """Save one submission and apply the duplicate rule, all in one transaction.

    Arguments are already validated (see staff_api SubmissionCreateSerializer).
    `fetched` may carry 'isbn': the ISBN first scanned/typed, so a corrected ISBN counts as an edit.
    `cover_photo`: a cleaned image file (see cover_photo.clean_cover_photo) or None.
    Raises DuplicateCheckBusy if another submission of the same book holds the lock for too long.
    """
    values = {'title': title, 'author': author, 'publisher': publisher, 'year': year, 'pages': pages}
    edited_fields = [k for k in METADATA_FIELDS if _text(fetched.get(k)) != _text(values[k])] if fetched else []
    missing_fields = [k for k in METADATA_FIELDS if _text(fetched.get(k)) == ''] if fetched else []
    if fetched and fetched.get('isbn') and fetched['isbn'] != isbn:
        edited_fields.append('isbn')
    if fetched and cover_photo:
        edited_fields.append('photo')  # a found book whose cover staff replaced (manual entries never show "Edited")
    now = timezone.now()

    book = Book(
        isbn=isbn, title=title, author=author, publisher=publisher, year=year, pages=pages,
        source=source, subjects=subjects or [], cover_url=cover_url, fetched=fetched,
        edited_fields=edited_fields, missing_fields=missing_fields, duplicate_key=duplicate_key(title, author),
        shelf=shelf, quantity=quantity, submitted_by=user, submitted_at=now,
    )
    if cover_photo:
        book.cover_photo = cover_photo  # written to MEDIA_ROOT when the row is saved

    # The per-book lock is held until after the commit, so the next submission of the same book sees this one.
    with duplicate_key_lock(book.duplicate_key), transaction.atomic():
        dup = find_duplicates(title, author, shelf.id, lock=True)  # also locks the matching rows against admin edits

        if dup.same_shelf:
            match = match_summary(dup.same_shelf)
            book.status = BookStatus.REJECTED
            book.auto_rejected = True
            book.rejected_at = now
            book.reject_reason = SAME_SHELF_REASON
            book.match = match
            book.save()
            outcome = SubmissionResult(REJECTED, book, match)
        elif dup.primary:
            match = match_summary(dup.primary)
            ready = dup.primary.status == BookStatus.OUT_OF_STOCK
            book.status = BookStatus.WAITING
            book.linked_item = dup.primary
            book.match = match
            book.waiting_ready_at = now if ready else None
            book.save()
            outcome = SubmissionResult(WAITING, book, match, ready)
        else:
            book.status = BookStatus.PENDING
            book.save()
            outcome = SubmissionResult(PENDING, book)

        if not book.cover_photo:
            transaction.on_commit(lambda: cache_cover_soon(book.pk))

        # Hook: activity-log entries ("Submitted", "Auto-rejected", "Waiting list created") and admin
        # notifications go here once the team agrees on the activity_logs / notifications owner.

    return outcome
