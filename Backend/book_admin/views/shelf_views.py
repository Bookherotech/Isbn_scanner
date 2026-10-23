from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from authentication.permissions import IsAdminRole
from book_admin.serializers import ShelfSerializer, ShelfWriteSerializer
from book_admin.models import ActivityLog
from book_admin.services import shelves_with_stats
from book_admin.services.activity_service import log_activity
from inventory.constants import ShelfStatus


class ShelfListView(APIView):
    """GET  /api/admin/shelves/?status=active|inactive&q=   every shelf with books / units / waiting / pending (one query, not paginated:
                                                         the rack map shows them all)
    POST /api/admin/shelves/ {code, note?, status?}      add a shelf (201); the code is letter-dash-two digits, e.g. A-13
    """

    permission_classes = [IsAdminRole]

    def get(self, request):
        rows = shelves_with_stats()
        wanted = request.query_params.get('status')
        if wanted in ShelfStatus.values:
            rows = rows.filter(status=wanted)
        text = request.query_params.get('q', '').strip()
        if text:
            rows = rows.filter(code__icontains=text)
        return Response(ShelfSerializer(rows, many=True).data)

    def post(self, request):
        serializer = ShelfWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        shelf = serializer.save()
        log_activity(action='Added shelf', kind=ActivityLog.Kind.SHELF, target=f'Shelf {shelf.code}', detail='Available in the staff shelf picker', actor=request.user)
        return Response(ShelfSerializer(shelves_with_stats().get(pk=shelf.pk)).data, status=status.HTTP_201_CREATED)


class ShelfDetailView(APIView):
    """GET   /api/admin/shelves/<code>/
    PATCH /api/admin/shelves/<code>/ {note?, status?}   edit the note, or activate / deactivate (hidden from the staff picker)
    The code cannot change. Books already on a deactivated shelf stay live.
    """

    permission_classes = [IsAdminRole]

    def _shelf(self, code):
        shelf = shelves_with_stats().filter(code=code.upper()).first()
        if shelf is None:
            raise NotFound('This shelf could not be found.')
        return shelf

    def get(self, request, code):
        return Response(ShelfSerializer(self._shelf(code)).data)

    def patch(self, request, code):
        shelf = self._shelf(code)
        serializer = ShelfWriteSerializer(shelf, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        before = {'status': shelf.status, 'note': shelf.note}
        serializer.save()
        after = serializer.validated_data
        if after.get('status', before['status']) != before['status']:
            on = after['status'] == ShelfStatus.ACTIVE
            log_activity(action='Activated shelf' if on else 'Deactivated shelf', kind=ActivityLog.Kind.SHELF, target=f'Shelf {shelf.code}', actor=request.user,
                         detail='Visible to staff' if on else 'Hidden from staff shelf picker', result=ActivityLog.Result.SUCCESS if on else ActivityLog.Result.WARNING)
        elif after.get('note', before['note']) != before['note']:
            log_activity(action='Updated shelf', kind=ActivityLog.Kind.SHELF, target=f'Shelf {shelf.code}', detail=after['note'] or 'Details updated', actor=request.user, result=ActivityLog.Result.INFO)
        return Response(ShelfSerializer(self._shelf(code)).data)
