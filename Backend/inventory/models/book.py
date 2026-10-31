from django.conf import settings
from django.db import models
from django.utils import timezone

from inventory.constants import BookSource, BookStatus


class Book(models.Model):
    """One submission = one book entry on one shelf (the prototype's "item").

    The same title can have several rows: e.g. a live entry on A-03 and a waiting-list entry on B-07.
    Staff create rows (staff_api); admin review, Shopify and stock changes update them (Anzil).
    """

    # ---- Book details (from metadata, edited by staff) ----
    isbn = models.CharField(max_length=13, db_index=True)  # always ISBN-13
    title = models.CharField(max_length=255)
    author = models.CharField(max_length=255)
    publisher = models.CharField(max_length=255, blank=True)
    year = models.PositiveSmallIntegerField(null=True, blank=True)
    pages = models.PositiveIntegerField(null=True, blank=True)
    source = models.CharField(max_length=12, choices=BookSource.choices, default=BookSource.MANUAL)
    subjects = models.JSONField(default=list, blank=True)  # subject / category names from the metadata provider
    cover_url = models.URLField(max_length=500, blank=True)  # from the metadata provider
    cover_photo = models.ImageField(upload_to='covers/%Y/%m/', blank=True)  # photo taken by staff; shown instead of the provider cover
    cached_cover = models.ImageField(upload_to='covers/cached/%Y/%m/', blank=True)  # our copy of the provider cover, see inventory.services.cover_cache
    cover_retry_at = models.DateTimeField(null=True, blank=True)  # no copy yet: when to try the download again (null = as soon as possible)
    fetched = models.JSONField(null=True, blank=True)  # metadata as fetched {title, author, publisher, year, pages}; null for manual entry
    edited_fields = models.JSONField(default=list, blank=True)  # what staff changed from the fetched book: metadata fields, 'isbn', 'photo'
    missing_fields = models.JSONField(default=list, blank=True)  # fields the metadata provider did not have
    duplicate_key = models.CharField(max_length=520)  # normalized "title|author", see inventory.services.normalize (indexed with status below)

    # ---- Shelf and quantity ----
    shelf = models.ForeignKey('inventory.Shelf', on_delete=models.PROTECT, related_name='books')
    quantity = models.PositiveIntegerField()  # quantity staff counted on the shelf
    stock = models.PositiveIntegerField(null=True, blank=True)  # units on Shopify once live

    # ---- Status ----
    status = models.CharField(max_length=12, choices=BookStatus.choices, default=BookStatus.PENDING)  # indexed with submitted_at below
    submitted_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='submitted_books')
    submitted_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    # ---- Duplicate / waiting list ----
    linked_item = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='waiting_entries')  # the entry this one waits behind
    match = models.JSONField(null=True, blank=True)  # snapshot of the matching entry at submit time
    waiting_ready_at = models.DateTimeField(null=True, blank=True)  # when the linked entry sold out

    # ---- Admin decisions ----
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    approved_at = models.DateTimeField(null=True, blank=True)
    rejected_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    rejected_at = models.DateTimeField(null=True, blank=True)
    auto_rejected = models.BooleanField(default=False)  # rejected by the system (duplicate on the same shelf), not by an admin
    reject_reason = models.CharField(max_length=120, blank=True)
    reject_note = models.TextField(blank=True)

    # ---- Shopify and stock (set by the Admin / Shopify module) ----
    product_id = models.CharField(max_length=40, blank=True)  # Shopify product; shared by entries of the same book
    sync_status = models.CharField(max_length=10, blank=True)  # '', 'synced', 'syncing', 'failed'
    last_sync_at = models.DateTimeField(null=True, blank=True)
    sync_error = models.TextField(blank=True)
    shopify_image = models.CharField(max_length=120, blank=True)  # the cover file (name) last handled for the Shopify product, so it is sent only once
    stock_out_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    closed_reason = models.CharField(max_length=255, blank=True)
    previous_shelf = models.ForeignKey('inventory.Shelf', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')

    # ---- Content-flag review (set by the Admin module) ----
    flag_reviewed_at = models.DateTimeField(null=True, blank=True)
    flag_reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    flag_note = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = 'inventory_books'
        indexes = [
            # Staff "my submissions": WHERE submitted_by = ? AND status = ? ORDER BY submitted_at DESC;
            # also the tab counts (GROUP BY status) and Home's pending / waiting counts, read from the index alone
            models.Index(fields=['submitted_by', 'status', 'submitted_at'], name='book_submitter_status_idx'),
            # Staff "All" tab newest first, and Home's "scanned today": WHERE submitted_by = ? [AND submitted_at >= ?]
            models.Index(fields=['submitted_by', 'submitted_at'], name='book_submitter_time_idx'),
            # Home's "approved today": WHERE submitted_by = ? AND approved_at >= ?
            models.Index(fields=['submitted_by', 'approved_at'], name='book_submitter_approved_idx'),
            # Admin queues (pending oldest first, FIFO waiting list, out of stock): WHERE status = ? ORDER BY submitted_at
            models.Index(fields=['status', 'submitted_at'], name='book_status_time_idx'),
            # Duplicate check: WHERE duplicate_key = ? AND status IN (...)
            models.Index(fields=['duplicate_key', 'status'], name='book_dupkey_status_idx'),
            # Books still needing a cover copy: WHERE cached_cover = '' AND (cover_retry_at IS NULL OR cover_retry_at <= ?)
            models.Index(fields=['cached_cover', 'cover_retry_at'], name='book_cover_copy_idx'),
            # Dashboard "approved" chart, reports, the Approved sort: WHERE approved_at >= ? / ORDER BY approved_at DESC
            models.Index(fields=['approved_at'], name='book_approved_idx'),
            # Reports and the Rejected sort: WHERE rejected_at >= ? / ORDER BY rejected_at DESC
            models.Index(fields=['rejected_at'], name='book_rejected_idx'),
            # Out-of-stock list: WHERE status = 'out_of_stock' ORDER BY stock_out_at DESC
            models.Index(fields=['status', 'stock_out_at'], name='book_status_stockout_idx'),
            # Product history on the book detail, Shopify stock updates: WHERE product_id = ?
            models.Index(fields=['product_id'], name='book_product_idx'),
        ]

    def __str__(self):
        return f'{self.title} ({self.shelf_id})'
