from django.db import models


class BookStatus(models.TextChoices):
    """Life cycle of one submission / shelf entry (same values the frontend uses)."""

    PENDING = 'pending', 'Pending'  # waiting for admin review
    WAITING = 'waiting', 'Waiting list'  # same book already active on another shelf
    LIVE = 'live', 'Live'  # approved, on Shopify
    OUT_OF_STOCK = 'out_of_stock', 'Out of stock'  # live entry that sold out
    REJECTED = 'rejected', 'Rejected'  # by an admin, or automatically (duplicate on the same shelf)
    CLOSED = 'closed', 'Shelf closed'  # sold out and replaced by a waiting-list entry


# Entries that count for the duplicate check (rejected and closed ones do not).
ACTIVE_STATUSES = (BookStatus.PENDING, BookStatus.WAITING, BookStatus.LIVE, BookStatus.OUT_OF_STOCK)
