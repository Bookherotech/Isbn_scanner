from django.db.models import Case, IntegerField, Value, When
from rest_framework.response import Response
from rest_framework.views import APIView

from authentication.constants import Role
from authentication.models import User
from authentication.permissions import IsAdminRole
from book_admin.serializers import BookSerializer
from book_admin.services import book_queryset
from book_admin.services.book_queries import search_filter
from book_admin.services.dashboard_service import build_dashboard, nav_counts
from book_admin.utils import display_name
from inventory.constants import BookStatus
from inventory.models import Shelf

SEARCH_MIN = 2
SEARCH_LIMIT = 8


class DashboardView(APIView):
    """GET /api/admin/dashboard/ -> {kpis, added7, status, shelves, shelf_count, attention, staff_today, now}"""

    permission_classes = [IsAdminRole]

    def get(self, request):
        return Response(build_dashboard(request))


class NavCountsView(APIView):
    """GET /api/admin/nav-counts/ -> {pending, waiting, ready, oos, flagged}: the sidebar badges (2 small queries)."""

    permission_classes = [IsAdminRole]

    def get(self, request):
        return Response(nav_counts())


class SearchView(APIView):
    """GET /api/admin/search/?q= -> up to 8 books (live first); shorter than 2 characters gives []."""

    permission_classes = [IsAdminRole]

    def get(self, request):
        text = request.query_params.get('q', '').strip()
        if len(text) < SEARCH_MIN:
            return Response([])
        rows = (
            book_queryset().exclude(status=BookStatus.CLOSED).filter(search_filter(text))
            .annotate(live_first=Case(When(status=BookStatus.LIVE, then=Value(0)), default=Value(1), output_field=IntegerField()))
            .order_by('live_first', '-submitted_at', '-id')[:SEARCH_LIMIT]
        )
        return Response(BookSerializer(rows, many=True, context={'request': request}).data)


class FilterOptionsView(APIView):
    """GET /api/admin/options/ -> {shelves: [{id, status}], staff: [{id, name}]} for the filter drop-downs."""

    permission_classes = [IsAdminRole]

    def get(self, request):
        shelves = Shelf.objects.only('code', 'status').order_by('code')
        staff = User.objects.filter(role=Role.STAFF).only('id', 'email', 'full_name').order_by('full_name', 'id')
        return Response({
            'shelves': [{'id': s.code, 'status': s.status} for s in shelves],
            'staff': [{'id': u.id, 'name': display_name(u)} for u in staff],
        })
