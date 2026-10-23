from django.db.models import Case, IntegerField, Value, When
from rest_framework.exceptions import ValidationError
from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from authentication.permissions import IsAdminRole
from book_admin.exceptions import BookNotFound
from book_admin.paginations import InventoryPagination
from book_admin.serializers import (
    BookDetailSerializer, BookRejectSerializer, BookSerializer, BookUpdateSerializer, BookWithWaitingSerializer,
)
from book_admin.services import (
    approve_book, approve_waiting_entry, book_queryset, filter_books, reject_book, update_book, with_open_waiting,
)
from book_admin.services import REJECTION_REASONS
from book_admin.services.book_queries import parse_statuses
from inventory.constants import BookStatus
from inventory.models import Book


class BookListView(ListAPIView):
    """GET /api/admin/books/?status=&q=&shelf=&staff=&source=&author=&approved_only=&reason=&sort=&page=&page_size=

    One list for Pending, Approved, Rejected and Live inventory: they differ only in the filters, e.g.
      Pending          ?status=pending&sort=oldest
      Approved         ?status=live,out_of_stock,closed&approved_only=true&sort=approved
      Rejected         ?status=rejected&reason=Damaged book&sort=rejected   (reasons: GET rejection-reasons/)
      Live inventory   ?status=live,out_of_stock&sort=title
    -> {results, total, page, pages, page_size}. Two queries per page (count + rows with everything joined).
    """

    permission_classes = [IsAdminRole]
    serializer_class = BookSerializer
    pagination_class = InventoryPagination

    def get_queryset(self):
        return filter_books(book_queryset(), self.request.query_params)


class BookDetailView(APIView):
    """GET   /api/admin/books/<id>/ -> the book, its waiting entries, Shopify shelf history and duplicate check
    PATCH /api/admin/books/<id>/ {title?, author?, publisher?, year?, pages?, shelf_id?, quantity?}  (pending / waiting only)
         -> {outcome: saved|moved_to_waiting|moved_to_pending, match, changes, item}
         409 {code: 'duplicate_same_shelf', match} when the edit would clash with a copy on the same shelf
    """

    permission_classes = [IsAdminRole]

    def get(self, request, pk):
        book = with_open_waiting(book_queryset()).filter(pk=pk).first()
        if book is None:
            raise BookNotFound
        return Response(BookDetailSerializer(book, context={'request': request}).data)

    def patch(self, request, pk):
        book = Book.objects.select_related('shelf').filter(pk=pk).first()
        if book is None:
            raise BookNotFound
        serializer = BookUpdateSerializer(data=request.data, context={'book': book})
        serializer.is_valid(raise_exception=True)
        outcome, match, changes, _ = update_book(pk, serializer.validated_data, request.user)
        item = book_queryset().get(pk=pk)
        return Response({'outcome': outcome, 'match': match, 'changes': changes, 'item': BookSerializer(item, context={'request': request}).data})


class BookApproveView(APIView):
    """POST /api/admin/books/<id>/approve/ -> the book, now live (409 {code: 'invalid_state'} unless it is pending)."""

    permission_classes = [IsAdminRole]

    def post(self, request, pk):
        approve_book(pk, request.user)
        return Response(BookSerializer(book_queryset().get(pk=pk), context={'request': request}).data)


class BookRejectView(APIView):
    """POST /api/admin/books/<id>/reject/ {reason, note?} -> the book, now rejected (pending or waiting entries only)."""

    permission_classes = [IsAdminRole]

    def post(self, request, pk):
        serializer = BookRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reject_book(pk, request.user, **serializer.validated_data)
        return Response(BookSerializer(book_queryset().get(pk=pk), context={'request': request}).data)


class RejectionReasonListView(APIView):
    """GET /api/admin/rejection-reasons/ -> the reasons for rejecting a book: the Reject dialog and the Rejected page dropdown."""

    permission_classes = [IsAdminRole]

    def get(self, request):
        return Response(REJECTION_REASONS)


class AuthorListView(APIView):
    """GET /api/admin/authors/?status=live,out_of_stock -> sorted author names for the Live inventory filter."""

    permission_classes = [IsAdminRole]

    def get(self, request):
        statuses = parse_statuses(request.query_params.get('status')) or list(BookStatus.values)
        authors = Book.objects.filter(status__in=statuses).order_by('author').values_list('author', flat=True).distinct()
        return Response(list(authors))


class WaitingListView(APIView):
    """GET /api/admin/waiting-list/?tab=ready|waiting|all -> {results: [book], counts: {ready, waiting, all}}

    One row per BOOK (same title + author), however many shelves it is waiting on. Each row has:
      key, isbn, title, author, ready (a sold-out copy is waiting to be replaced),
      entries: the waiting-list entries for that book, OLDEST FIRST (the shelf that was added first comes first);
               each entry is a full book row (shelf_id, quantity, linked = the shelf it waits behind, submitted_by_name ...).
    Ready books come first, then the book whose oldest entry has waited longest. `counts` count books.
    The whole list comes back (it is short and the screen switches tabs without asking again); `tab` only narrows `results`.
    """

    permission_classes = [IsAdminRole]

    def get(self, request):
        tab = request.query_params.get('tab', 'all')
        if tab not in ('ready', 'waiting', 'all'):
            raise ValidationError({'tab': 'Must be ready, waiting or all.'})
        entries = list(book_queryset().filter(status=BookStatus.WAITING).order_by('submitted_at', 'id'))  # one query, everything joined
        context = {'request': request}
        serialized = BookSerializer(entries, many=True, context=context).data
        groups = {}
        for entry, data in zip(entries, serialized):
            group = groups.setdefault(entry.duplicate_key, {
                'key': entry.duplicate_key, 'isbn': entry.isbn, 'title': entry.title, 'author': entry.author, 'ready': False, 'entries': [],
            })
            group['entries'].append(data)
            group['ready'] = group['ready'] or data['ready']
        books = sorted(groups.values(), key=lambda g: not g['ready'])  # stable: ready first, otherwise the book waiting longest first
        ready = sum(1 for g in books if g['ready'])
        if tab != 'all':
            books = [g for g in books if g['ready'] == (tab == 'ready')]
        return Response({'results': books, 'counts': {'ready': ready, 'waiting': len(groups) - ready, 'all': len(groups)}})


class WaitingApproveView(APIView):
    """POST /api/admin/waiting-list/<id>/approve/ -> {item, closed}: the entry goes live on the same product and its shelf becomes
    the active one; `closed` is the sold-out entry it replaces. 409 {code: 'not_ready'} while the current stock has not sold out."""

    permission_classes = [IsAdminRole]

    def post(self, request, pk):
        entry, primary = approve_waiting_entry(pk, request.user)
        context = {'request': request}
        return Response({
            'item': BookSerializer(book_queryset().get(pk=entry.pk), context=context).data,
            'closed': BookSerializer(book_queryset().get(pk=primary.pk), context=context).data,
        })


class OutOfStockView(APIView):
    """GET /api/admin/out-of-stock/ -> books that sold out, latest first, each with the waiting entries behind it."""

    permission_classes = [IsAdminRole]

    def get(self, request):
        rows = with_open_waiting(book_queryset().filter(status=BookStatus.OUT_OF_STOCK)).order_by('-stock_out_at', '-id')
        return Response(BookWithWaitingSerializer(rows, many=True, context={'request': request}).data)
