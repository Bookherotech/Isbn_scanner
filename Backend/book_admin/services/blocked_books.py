"""The "Blocked books" master: ISBNs the store does not take. Staff scanning one are refused (see staff_api IsbnLookupView),
and a submission of one is saved as auto-rejected (see inventory.services.create_submission)."""

from book_admin.models import BlockedBook


def blocked_book(isbn13):
    """The BlockedBook for this ISBN-13, or None."""
    return BlockedBook.objects.filter(isbn=isbn13).first() if isbn13 else None


def blocked_summary(blocked):
    """What staff are shown: {isbn, title, author, reason}."""
    return {'isbn': blocked.isbn, 'title': blocked.title, 'author': blocked.author, 'reason': blocked.reason}
