from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from authentication.permissions import IsAdminRole
from book_admin.models import ActivityLog, BlockedBook
from book_admin.serializers import BlockedBookSerializer
from book_admin.services.activity_service import log_activity
from integrations.metadata import MetadataNotFound, MetadataUnavailable, lookup_isbn
from inventory.services import to_isbn13
from staff_api.exceptions import InvalidIsbn, IsbnNotFound, MetadataServiceUnavailable

DETAIL_KEYS = ('isbn', 'title', 'author', 'publisher', 'year', 'pages', 'cover_url', 'source')


def _name(blocked):
    return blocked.title or blocked.isbn


class BlockedBookListView(APIView):
    """GET  /api/admin/blocked-books/ -> every blocked book, newest first
    POST /api/admin/blocked-books/ {isbn, title?, author?, publisher?, year?, cover_url?, reason?} -> 201
         From then on staff scanning this ISBN are refused, and a submission of it is saved as auto-rejected.
    """

    permission_classes = [IsAdminRole]

    def get(self, request):
        return Response(BlockedBookSerializer(BlockedBook.objects.select_related('added_by'), many=True).data)

    def post(self, request):
        serializer = BlockedBookSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        blocked = serializer.save(added_by=request.user)
        log_activity(action='Blocked book', kind=ActivityLog.Kind.REJECTION, target=_name(blocked), actor=request.user, result=ActivityLog.Result.WARNING,
                     detail=f'ISBN {blocked.isbn} · rejected when scanned' + (f' · {blocked.reason}' if blocked.reason else ''))
        return Response(BlockedBookSerializer(blocked).data, status=status.HTTP_201_CREATED)


class BlockedBookDetailView(APIView):
    """DELETE /api/admin/blocked-books/<id>/ -> 204. Staff can submit this ISBN again."""

    permission_classes = [IsAdminRole]

    def delete(self, request, pk):
        blocked = BlockedBook.objects.filter(pk=pk).first()
        if blocked is None:
            raise NotFound('This blocked book could not be found.')
        name, isbn = _name(blocked), blocked.isbn
        blocked.delete()
        log_activity(action='Unblocked book', kind=ActivityLog.Kind.REJECTION, target=name, actor=request.user, result=ActivityLog.Result.INFO,
                     detail=f'ISBN {isbn} · staff can submit it again')
        return Response(status=status.HTTP_204_NO_CONTENT)


class BlockedBookLookupView(APIView):
    """GET /api/admin/blocked-books/lookup/<isbn>/ -> the book details for an ISBN, as the staff scan finds them
    ({isbn, title, author, publisher, year, pages, cover_url, source, blocked}); `blocked` is true when it is already in the list.
    400 {code: 'invalid_isbn'} · 404 {code: 'not_found'} · 503 {code: 'service_unavailable'}
    """

    permission_classes = [IsAdminRole]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'isbn_lookup'

    def get(self, request, isbn):
        isbn13 = to_isbn13(isbn)
        if not isbn13:
            raise InvalidIsbn
        try:
            record = lookup_isbn(isbn13)
        except MetadataNotFound:
            raise IsbnNotFound from None
        except MetadataUnavailable:
            raise MetadataServiceUnavailable from None
        details = {key: record.get(key) for key in DETAIL_KEYS}
        details['isbn'] = isbn13
        return Response({**details, 'blocked': BlockedBook.objects.filter(isbn=isbn13).exists()})
