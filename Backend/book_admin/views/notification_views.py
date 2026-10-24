from django.db.models import Exists, OuterRef, Q
from django.utils.dateparse import parse_datetime
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from book_admin.models import Notification, NotificationRead
from book_admin.serializers import NotificationSerializer

N = Notification.Type
GROUPS = {
    'stock': [N.STOCK_OUT, N.STOCK_OUT_REMINDER, N.WAITING_APPROVED],
    'waiting': [N.WAITING_READY, N.WAITING_CREATED, N.WAITING_APPROVED],
    'submissions': [N.NEW_SUBMISSION, N.APPROVED, N.REJECTED, N.FLAGGED],
    'flags': [N.FLAGGED],
}
LIMIT = 100


def visible_to(user):
    """Notifications this person may see: for everyone, for their role, or addressed to them."""
    return Notification.objects.filter(Q(audience='all') | Q(audience=user.role) | Q(recipient=user))


def with_read_flag(queryset, user):
    return queryset.annotate(is_read=Exists(NotificationRead.objects.filter(notification=OuterRef('pk'), user=user)))


class NotificationListView(APIView):
    """GET /api/notifications/?filter=all|unread|stock|waiting|submissions|flags&since=<iso time>&push=true

    For the signed-in user, Admin or Staff (each sees their own audience). Newest first, at most 100.
    `push=true&since=` returns only push notifications newer than that time (the in-app toasts).
    -> {results: [{id, type, title, body, push, created_at, item_id, read}], unread}
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        params = request.query_params
        mine = visible_to(request.user)
        rows = with_read_flag(mine, request.user)
        wanted = params.get('filter', 'all')
        if wanted == 'unread':
            rows = rows.filter(is_read=False)
        elif wanted in GROUPS:
            rows = rows.filter(type__in=GROUPS[wanted])
        elif wanted != 'all':
            raise ValidationError({'filter': f'Must be all, unread or one of: {", ".join(GROUPS)}.'})
        if params.get('push', '').lower() == 'true':
            rows = rows.filter(push=True)
        if params.get('since'):
            since = parse_datetime(params['since'])
            if since is None:
                raise ValidationError({'since': 'Use an ISO date and time.'})
            rows = rows.filter(created_at__gt=since)
        unread = with_read_flag(mine, request.user).filter(is_read=False).count()
        return Response({'results': NotificationSerializer(rows.order_by('-created_at', '-id')[:LIMIT], many=True).data, 'unread': unread})


class UnreadCountView(APIView):
    """GET /api/notifications/unread-count/ -> {unread} (one small query, for the badge)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({'unread': with_read_flag(visible_to(request.user), request.user).filter(is_read=False).count()})


class MarkReadView(APIView):
    """POST /api/notifications/<id>/read/ -> {unread}"""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not visible_to(request.user).filter(pk=pk).exists():
            raise NotFound('This notification could not be found.')
        NotificationRead.objects.get_or_create(notification_id=pk, user=request.user)
        return Response({'unread': with_read_flag(visible_to(request.user), request.user).filter(is_read=False).count()})


class MarkAllReadView(APIView):
    """POST /api/notifications/read-all/ -> {unread: 0}"""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        ids = with_read_flag(visible_to(request.user), request.user).filter(is_read=False).values_list('id', flat=True)
        NotificationRead.objects.bulk_create([NotificationRead(notification_id=i, user=request.user) for i in ids], ignore_conflicts=True)
        return Response({'unread': 0})
