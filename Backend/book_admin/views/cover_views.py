import logging
import threading
from datetime import date, timedelta

from django.db import connections, transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from authentication.permissions import IsAdminRole
from book_admin.exceptions import InvalidState
from book_admin.models import ActivityLog
from book_admin.serializers import BookSerializer
from book_admin.services import book_queryset
from book_admin.services.activity_service import log_activity, quoted
from book_admin.services.flag_service import covers_to_check
from book_admin.utils.dates import start_of_day, store_today
from inventory.constants import BookStatus
from inventory.models import Book
from inventory.services import InvalidCoverPhoto, clean_cover_photo

logger = logging.getLogger(__name__)

COVER_STATUSES = (BookStatus.PENDING, BookStatus.WAITING, BookStatus.LIVE, BookStatus.OUT_OF_STOCK)  # not rejected / closed
LIMIT = 500


def _push_soon(book_id):
    """Send a new photo of an approved book to its Shopify product now, in a background thread (the scheduled sync
    would also pick it up)."""
    from integrations.shopify import is_configured  # here, not at the top: integrations.shopify imports book_admin.services
    from integrations.shopify.sync import push_image

    if not is_configured():
        return

    def work():
        try:
            book = Book.objects.filter(pk=book_id).first()
            if book is not None:
                push_image(book)
        except Exception:
            logger.exception('Could not send the new cover of book %s to Shopify', book_id)
        finally:
            connections.close_all()

    threading.Thread(target=work, daemon=True, name=f'cover-push-{book_id}').start()


class CoverListView(APIView):
    """GET /api/admin/covers/?tab=check|day&date=YYYY-MM-DD -> {tab, date, today, check, results: [books]}

    check: the new books waiting here before they go to Pending / Waiting list (cover_hold), any day, in scan order.
           A flagged one shows only after its flag is reviewed on the Flags page.
    day:   every book scanned that day (store time; today when no date), in scan order, without rejected / closed ones.
    `check` is how many books wait here.
    """

    permission_classes = [IsAdminRole]

    def get(self, request):
        tab = request.query_params.get('tab', 'check')
        if tab not in ('check', 'day'):
            raise ValidationError({'tab': 'Must be check or day.'})
        raw = request.query_params.get('date', '').strip()
        try:
            day = date.fromisoformat(raw) if raw else store_today()
        except ValueError:
            raise ValidationError({'date': 'Use a date like 2026-11-25.'}) from None
        if tab == 'check':
            rows = book_queryset().filter(id__in=covers_to_check())
        else:
            rows = book_queryset().filter(submitted_at__gte=start_of_day(day), submitted_at__lt=start_of_day(day + timedelta(days=1)), status__in=COVER_STATUSES)
        rows = rows.order_by('submitted_at', 'id')[:LIMIT]
        return Response({
            'tab': tab, 'date': day.isoformat(), 'today': store_today().isoformat(), 'check': covers_to_check().count(),
            'results': BookSerializer(rows, many=True, context={'request': request}).data,
        })


class CoverReleaseView(APIView):
    """POST /api/admin/covers/release/ {ids: [book ids]} -> {released}

    Sends books on from the Covers page: each joins Pending or the Waiting list (whichever the scan decided; a Shopify
    wait still moves to Pending once the store's stock sells out). Books with no photo keep the image rule: a product
    already in the Shopify store keeps its image, a new product gets the fetched cover.
    """

    permission_classes = [IsAdminRole]

    def post(self, request):
        ids = request.data.get('ids')
        if not isinstance(ids, list) or not ids or not all(isinstance(i, int) and not isinstance(i, bool) for i in ids):
            raise ValidationError({'ids': 'Give a list of book ids.'})
        books = list(covers_to_check().filter(pk__in=ids))  # never a book whose flag review is still open
        with transaction.atomic():
            released = Book.objects.filter(pk__in=[b.pk for b in books], cover_hold=True).update(cover_hold=False)  # one statement, no row locks held
            for book in books:
                where = 'Waiting list' if book.status == BookStatus.WAITING else 'Pending'
                log_activity(action='Cover checked', kind=ActivityLog.Kind.EDIT, target=quoted(book), actor=request.user, book=book, result=ActivityLog.Result.INFO,
                             detail=f'{"New photo" if book.cover_photo else "No photo"} · sent to {where}')
        return Response({'released': released})


class BookCoverView(APIView):
    """PUT /api/admin/books/<id>/cover/ {cover_photo: 'data:image/...;base64,...'} -> the book, with the photo as its cover.

    Any book that is not rejected or closed. The photo goes to Shopify when the book is approved (it replaces the
    product's images); an approved book's product gets it right away. The book's status (pending / waiting) is unchanged.
    """

    permission_classes = [IsAdminRole]

    def put(self, request, pk):
        try:
            photo = clean_cover_photo(request.data.get('cover_photo'))
        except InvalidCoverPhoto as error:
            raise ValidationError({'cover_photo': str(error)}) from None
        book = Book.objects.filter(pk=pk).first()
        if book is None:
            raise NotFound('This book could not be found.')
        if book.status not in COVER_STATUSES:
            raise InvalidState('Rejected or closed books cannot get a new cover.')

        book.cover_photo.save(photo.name, photo, save=False)  # writes the file; the row is updated below
        with transaction.atomic():
            # Only the photo column: an approval running at the same moment keeps its status change.
            if not Book.objects.filter(pk=pk, status__in=COVER_STATUSES).update(cover_photo=book.cover_photo.name, cover_dropped_at=timezone.now()):
                book.cover_photo.delete(save=False)
                raise InvalidState('Rejected or closed books cannot get a new cover.')
            log_activity(action='Cover updated', kind=ActivityLog.Kind.EDIT, target=quoted(book), actor=request.user, book=book, result=ActivityLog.Result.INFO,
                         detail='New photo · replaces the Shopify image' + ('' if book.status in (BookStatus.LIVE, BookStatus.OUT_OF_STOCK) else ' when approved'))
            if book.status in (BookStatus.LIVE, BookStatus.OUT_OF_STOCK) and book.product_id:
                transaction.on_commit(lambda: _push_soon(book.pk))
        return Response(BookSerializer(book_queryset().get(pk=pk), context={'request': request}).data)
