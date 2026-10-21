from zoneinfo import ZoneInfo

from django.conf import settings
from django.db.models import Count
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from inventory.constants import BookStatus
from inventory.models import Book
from staff_api.permissions import IsStaffRole
from staff_api.serializers import SubmissionSerializer
from staff_api.services import my_submissions

RECENT_COUNT = 5


def start_of_store_day():
    """Midnight today in the store's timezone (STORE_TIME_ZONE)."""
    local_now = timezone.localtime(timezone.now(), ZoneInfo(settings.STORE_TIME_ZONE))
    return local_now.replace(hour=0, minute=0, second=0, microsecond=0)


class StaffHomeView(APIView):
    """GET /api/staff/home/ -> {today: {scanned, pending, approved, waiting}, recent: [5 latest submissions]}.

    scanned / approved count today only; pending / waiting are what is open now.
    Each count reads only the matching index entries (see Book.Meta.indexes), so the cost does not
    grow with how many books the staff member has ever submitted.
    """

    permission_classes = [IsStaffRole]

    def get(self, request):
        today = start_of_store_day()
        own = Book.objects.filter(submitted_by=request.user).order_by()
        open_counts = dict(
            own.filter(status__in=(BookStatus.PENDING, BookStatus.WAITING)).values_list('status').annotate(n=Count('id'))
        )
        stats = {
            'scanned': own.filter(submitted_at__gte=today).count(),  # book_submitter_time_idx
            'pending': open_counts.get(BookStatus.PENDING, 0),  # book_submitter_status_idx
            'approved': own.filter(approved_at__gte=today).count(),  # book_submitter_approved_idx
            'waiting': open_counts.get(BookStatus.WAITING, 0),
        }
        recent = my_submissions(request.user).order_by('-submitted_at', '-id')[:RECENT_COUNT]
        return Response({'today': stats, 'recent': SubmissionSerializer(recent, many=True, context={'request': request}).data})
