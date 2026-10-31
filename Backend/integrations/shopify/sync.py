"""Keeping BookHero and Shopify in step. `run_sync` is the scheduled job; each step is also safe to call on its own.

1. Publish: live books that are not on Shopify yet (or whose stock was never pushed) get a product and their
   counted quantity. A book whose ISBN is already a SKU in the store is linked to that product, not duplicated.
   A waiting-list entry approved onto an existing product pushes its new quantity.
2. Stock check: Shopify's 'available' count is read back. 0 -> out of stock (waiting-list entries become ready,
   everyone is notified); back above 0 (restocked in Shopify) -> live again. A product deleted in Shopify ->
   out of stock with sync status 'deleted' (shown as "Deleted on Shopify"); it is not checked again, and a
   waiting-list entry approved after it gets a new product.
3. Reminders: books still out of stock after AppSettings.reminder_after_hours get one more notification.
4. Images: a staff photo or our copy of the cover is uploaded to products BookHero created. The store's own products
   (linked by SKU) are left alone, and a saved cover copy is not added to a product that already has an image.

Shopify is never called inside a database transaction, so a slow API never holds row locks.
"""

import logging
from datetime import timedelta

from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone

from book_admin.models import ActivityLog, AppSettings, Notification
from book_admin.services.activity_service import log_activity, notify, quoted
from inventory.constants import BookStatus
from inventory.models import Book
from integrations.shopify.client import is_configured
from integrations.shopify.exceptions import ProductGone, ShopifyError, ShopifyNotConfigured
from integrations.shopify.products import (
    attach_image, available_stock, create_product, find_by_isbn, inventory_item_of, numeric_id, product_media, set_available, shop_info,
)

logger = logging.getLogger(__name__)

PUBLISH_BATCH = 25  # books put on Shopify per run; the rest follow on the next runs
IMAGE_BATCH = 10  # images uploaded per run
STOCK_STATUSES = (BookStatus.LIVE, BookStatus.OUT_OF_STOCK)
SYNCED, SYNCING, FAILED, DELETED = 'synced', 'syncing', 'failed', 'deleted'
CLAIM_SECONDS = 120  # a book left 'syncing' longer than this was abandoned (a crash), so it may be pushed again
RUN_MARGIN = timedelta(seconds=15)  # cron starts on the minute but a run reads the clock seconds later: without this, a run can land just inside the interval and be skipped
K, R, A = ActivityLog.Kind, ActivityLog.Result, ActivityLog.ActorType

# Live books whose stock Shopify does not have yet: never published, failed, or approved after the last push
# (a waiting-list entry copies the old entry's product and sync time when it is approved).
NEEDS_PUSH = Q(product_id='') | Q(sync_status__in=(SYNCING, FAILED)) | Q(last_sync_at__isnull=True) | Q(last_sync_at__lt=F('approved_at'))


def check_connection():
    """Ask Shopify who we are; saves the result on AppSettings. -> {'shop', 'domain', 'location'}. Raises ShopifyError."""
    try:
        info = shop_info()
    except ShopifyError:
        AppSettings.objects.filter(pk=1).update(shopify_connected=False)
        raise
    app = AppSettings.load()
    app.shopify_connected = True
    app.store_domain = app.store_domain or info['domain']
    app.store_location = app.store_location or info['location']
    app.save(update_fields=['shopify_connected', 'store_domain', 'store_location', 'updated_at'])
    return info


def _sync_failed(book, error):
    """Mark the book failed. The log line and the admin notification are sent only the first time it fails."""
    first_time = book.sync_status != FAILED
    Book.objects.filter(pk=book.pk).update(sync_status=FAILED, sync_error=str(error)[:2000], last_sync_at=timezone.now())
    logger.warning('Shopify sync failed for book %s: %s', book.pk, error)
    if first_time:
        log_activity(action='Sync failed', kind=K.SHOPIFY, target=quoted(book), detail=str(error), actor_type=A.SHOPIFY, result=R.ERROR, book=book)
        notify(type=Notification.Type.SYNC_FAILED, title='Shopify sync failed', audience=Notification.Audience.ADMIN, book=book,
               body=f'{quoted(book)} could not be updated on Shopify: {error}')


def _claim(book):
    """Mark the book 'syncing' unless someone else is pushing it or changed it since we read it. -> True if it is ours.

    Approving a book and the scheduled sync can reach the same book together; without this both would create a product.
    """
    now = timezone.now()
    if book.sync_status == SYNCING and book.updated_at > now - timedelta(seconds=CLAIM_SECONDS):
        return False
    same = Book.objects.filter(pk=book.pk, sync_status=book.sync_status, product_id=book.product_id, last_sync_at=book.last_sync_at)
    return same.update(sync_status=SYNCING, updated_at=now) == 1


def publish_book(book_id):
    """Put one live book's stock on Shopify (create or link its product first). -> the book, or None if skipped / failed."""
    book = Book.objects.select_related('shelf').filter(pk=book_id, status=BookStatus.LIVE).first()
    if book is None or not _claim(book):
        return None
    quantity = book.stock if book.stock is not None else book.quantity
    try:
        if book.product_id and book.sync_status != DELETED:  # a deleted product cannot be reused: make or find a new one
            set_available(inventory_item_of(book.product_id), quantity)
            product_id, action, detail = book.product_id, 'Stock pushed', f'Shelf {book.shelf.code} · {quantity} available'
        else:
            existing = find_by_isbn(book.isbn)
            if existing:
                gid, item = existing
                set_available(item, quantity)
                action = 'Linked to product'
            else:
                gid, item = create_product(book, quantity)
                action = 'Product created'
            product_id, detail = numeric_id(gid), f'Product {numeric_id(gid)} · {quantity} available'
    except ShopifyNotConfigured:
        raise
    except ProductGone as error:
        if book.last_sync_at and book.approved_at and book.last_sync_at >= book.approved_at:  # it was on Shopify and got deleted there
            _mark_deleted(book.pk, timezone.now(), force=True)
        else:  # a waiting-list entry approved onto a product deleted meanwhile: give it a new one
            Book.objects.filter(pk=book.pk).update(sync_status=DELETED)
            return publish_book(book.pk)
        return None
    except ShopifyError as error:
        _sync_failed(book, error)
        return None

    now = timezone.now()
    with transaction.atomic():
        Book.objects.filter(pk=book.pk).update(product_id=product_id, sync_status=SYNCED, sync_error='', last_sync_at=now)
        log_activity(action=action, kind=K.SHOPIFY, target=quoted(book), detail=detail, actor_type=A.SHOPIFY, book=book)
    book.product_id, book.sync_status, book.sync_error, book.last_sync_at = product_id, SYNCED, '', now
    push_image(book)
    return book


def push_image(book):
    """Send the book's photo or cover copy to its Shopify product, once per file. -> True if an image was uploaded.

    A problem here never fails the book: stock and product stay synced, and the next run tries again.
    """
    image = book.cover_photo or book.cached_cover
    if not image or not book.product_id or book.shopify_image == image.name:
        return False
    try:
        media = product_media(book.product_id)
        if media is None:
            return False  # gone from Shopify: the stock check marks the book deleted
        if not media['ours'] or (media['has_media'] and not book.cover_photo):
            Book.objects.filter(pk=book.pk).update(shopify_image=image.name)  # nothing to send: do not ask again
            return False
        with image.open('rb') as file:
            raw = file.read()
        attach_image(book.product_id, raw, image.name.rsplit('/', 1)[-1], book.title)
    except (ShopifyError, OSError) as error:
        logger.warning('Could not send the image of book %s to Shopify: %s', book.pk, error)
        if not ActivityLog.objects.filter(book=book, action='Image not sent').exists():
            log_activity(action='Image not sent', kind=K.SHOPIFY, target=quoted(book), detail=str(error), actor_type=A.SHOPIFY, result=R.WARNING, book=book)
        return False
    Book.objects.filter(pk=book.pk).update(shopify_image=image.name)
    log_activity(action='Image sent', kind=K.SHOPIFY, target=quoted(book), detail=f'Product {book.product_id}', actor_type=A.SHOPIFY, book=book)
    return True


def push_images(limit=IMAGE_BATCH):
    """push_image for books whose photo or cover copy has not been handled yet, newest first. -> how many were uploaded."""
    photo_waiting = ~Q(cover_photo='') & ~Q(shopify_image=F('cover_photo'))
    copy_waiting = Q(cover_photo='') & ~Q(cached_cover='') & ~Q(shopify_image=F('cached_cover'))
    books = Book.objects.filter(photo_waiting | copy_waiting, status__in=STOCK_STATUSES).exclude(product_id='').exclude(NEEDS_PUSH).exclude(sync_status=DELETED)
    return sum(1 for book in books.order_by('-id')[:limit] if push_image(book))


def publish_pending(limit=PUBLISH_BATCH):
    """publish_book for live books Shopify does not have yet. -> how many were published.

    Never-tried books go first, then the longest-waiting retries, so a few books that keep failing cannot block new ones.
    """
    order = (F('last_sync_at').asc(nulls_first=True), 'approved_at', 'id')
    ids = list(Book.objects.filter(NEEDS_PUSH, status=BookStatus.LIVE).order_by(*order).values_list('id', flat=True)[:limit])
    return sum(1 for book_id in ids if publish_book(book_id))


def _apply_stock(book_id, available, now):
    """Save Shopify's count on one book and handle sold out / restocked. -> 'sold_out' | 'restocked' | None."""
    with transaction.atomic():
        book = Book.objects.select_for_update().select_related('shelf').filter(pk=book_id, status__in=STOCK_STATUSES).first()
        if book is None or Book.objects.filter(NEEDS_PUSH, pk=book_id).exists():  # changed by an admin since we read it
            return None
        change = None
        book.stock, book.sync_status, book.sync_error, book.last_sync_at = available, SYNCED, '', now
        waiting = Book.objects.filter(status=BookStatus.WAITING, linked_item=book)
        if book.status == BookStatus.LIVE and available == 0:
            change = 'sold_out'
            book.status, book.stock_out_at = BookStatus.OUT_OF_STOCK, now
            ready = list(waiting.select_related('shelf').order_by('submitted_at'))
            waiting.update(waiting_ready_at=now)
            log_activity(action='Sold out', kind=K.STOCK, target=quoted(book), detail=f'Shelf {book.shelf.code} · 0 left on Shopify', actor_type=A.SHOPIFY, result=R.WARNING, book=book)
            notify(type=Notification.Type.STOCK_OUT, title='Out of stock', audience=Notification.Audience.ALL, book=book,
                   body=f'{book.title} sold out on {book.shelf.code}.' + (' A waiting-list entry is ready for approval.' if ready else ''))
            if ready:
                notify(type=Notification.Type.WAITING_READY, title='Waiting list ready', audience=Notification.Audience.ADMIN, book=ready[0],
                       body=f'{book.title} is out of stock — the entry on {ready[0].shelf.code} is ready for approval.')
        elif book.status == BookStatus.OUT_OF_STOCK and available > 0:
            change = 'restocked'
            book.status, book.stock_out_at = BookStatus.LIVE, None
            waiting.update(waiting_ready_at=None)
            log_activity(action='Restocked', kind=K.STOCK, target=quoted(book), detail=f'Shelf {book.shelf.code} · {available} available on Shopify', actor_type=A.SHOPIFY, book=book)
        book.save(update_fields=['stock', 'status', 'stock_out_at', 'sync_status', 'sync_error', 'last_sync_at', 'updated_at'])
    return change


def _mark_deleted(book_id, now, force=False):
    """The book's product is gone from Shopify: out of stock, sync status 'deleted'. -> True if the book was changed.

    `force` skips the "changed by an admin since we read it" check (publish_book already knows the product is gone).
    """
    with transaction.atomic():
        book = Book.objects.select_for_update().select_related('shelf').filter(pk=book_id, status__in=STOCK_STATUSES).first()
        if book is None or book.sync_status == DELETED or (not force and Book.objects.filter(NEEDS_PUSH, pk=book_id).exists()):
            return False
        was_live = book.status == BookStatus.LIVE
        book.status, book.stock, book.stock_out_at = BookStatus.OUT_OF_STOCK, 0, book.stock_out_at or now
        book.sync_status, book.sync_error, book.last_sync_at = DELETED, 'The product was deleted on Shopify.', now
        book.save(update_fields=['status', 'stock', 'stock_out_at', 'sync_status', 'sync_error', 'last_sync_at', 'updated_at'])
        waiting = Book.objects.filter(status=BookStatus.WAITING, linked_item=book)
        ready = list(waiting.select_related('shelf').order_by('submitted_at'))
        if was_live:
            waiting.update(waiting_ready_at=now)
        log_activity(action='Deleted on Shopify', kind=K.SHOPIFY, target=quoted(book), detail=f'Product {book.product_id} · shelf {book.shelf.code}', actor_type=A.SHOPIFY, result=R.WARNING, book=book)
        notify(type=Notification.Type.SYNC_FAILED, title='Deleted on Shopify', audience=Notification.Audience.ADMIN, book=book,
               body=f'{quoted(book)} was deleted on Shopify, so it is now out of stock.' + (' A waiting-list entry is ready for approval.' if ready else ''))
        if was_live and ready:
            notify(type=Notification.Type.WAITING_READY, title='Waiting list ready', audience=Notification.Audience.ADMIN, book=ready[0],
                   body=f'{book.title} is out of stock — the entry on {ready[0].shelf.code} is ready for approval.')
    return True


def check_stock():
    """Read Shopify's stock for every live / out-of-stock book. -> {'checked', 'sold_out', 'restocked', 'deleted'}."""
    books = list(Book.objects.filter(status__in=STOCK_STATUSES).exclude(NEEDS_PUSH).exclude(sync_status=DELETED).select_related('shelf'))
    stock = available_stock(b.product_id for b in books)
    now = timezone.now()
    counts = {'checked': len(books), 'sold_out': 0, 'restocked': 0, 'deleted': 0}
    for book in books:
        if book.product_id not in stock:
            counts['deleted'] += _mark_deleted(book.pk, now)
            continue
        change = _apply_stock(book.pk, stock[book.product_id], now)
        if change:
            counts[change] += 1
    return counts


def send_reminders():
    """One more notification for each book still out of stock after reminder_after_hours. -> how many were sent."""
    cutoff = timezone.now() - timedelta(hours=AppSettings.load().reminder_after_hours)
    sent = 0
    for book in Book.objects.filter(status=BookStatus.OUT_OF_STOCK, stock_out_at__lte=cutoff).select_related('shelf'):
        if Notification.objects.filter(type=Notification.Type.STOCK_OUT_REMINDER, book=book, created_at__gte=book.stock_out_at).exists():
            continue
        waiting = Book.objects.filter(status=BookStatus.WAITING, linked_item=book).exists()
        missing = ' Its Shopify product was deleted.' if book.sync_status == DELETED else ''
        notify(type=Notification.Type.STOCK_OUT_REMINDER, title='Still out of stock', audience=Notification.Audience.ADMIN, book=book,
               body=f'{book.title} ({book.shelf.code}) is still out of stock.{missing}' + (' Approve the waiting-list entry.' if waiting else ' Restock it in Shopify.' if not missing else ''))
        sent += 1
    return sent


def run_sync(force=False):
    """The scheduled job: publish, check stock, send reminders. Waits AppSettings.stock_poll_minutes between runs
    unless `force`. -> a summary dict (or {'skipped': reason})."""
    if not is_configured():
        return {'skipped': 'Shopify is not set up in .env'}
    app = AppSettings.load()
    now = timezone.now()
    if not force and app.last_stock_check_at and now - app.last_stock_check_at < timedelta(minutes=app.stock_poll_minutes) - RUN_MARGIN:
        return {'skipped': 'checked less than stock_poll_minutes ago'}
    was_connected = app.shopify_connected
    try:
        check_connection()
        published = publish_pending()
        stock = check_stock()
    except ShopifyError as error:
        logger.error('Shopify sync failed: %s', error)
        if was_connected:
            log_activity(action='Connection lost', kind=K.SHOPIFY, target='Shopify', detail=str(error), actor_type=A.SHOPIFY, result=R.ERROR)
        AppSettings.objects.filter(pk=1).update(shopify_connected=False)
        return {'error': str(error)}
    reminders = send_reminders()
    images = push_images()
    AppSettings.objects.filter(pk=1).update(last_stock_check_at=now)
    if not was_connected:
        log_activity(action='Connected', kind=K.SHOPIFY, target='Shopify', detail=f'Store {AppSettings.load().store_domain}', actor_type=A.SHOPIFY)
    return {'published': published, **stock, 'reminders': reminders, 'images': images}
