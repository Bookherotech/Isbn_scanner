from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from authentication.permissions import IsAdminRole
from book_admin.services.report_service import build_report
from inventory.constants import BookStatus

MAX_DAYS = 90


class ReportView(APIView):
    """GET /api/admin/reports/?days=14&shelf=A-03&staff=<id>&status= -> {series, totals, by_shelf, staff_rows, lists, reasons}"""

    permission_classes = [IsAdminRole]

    def get(self, request):
        params = request.query_params
        days = params.get('days', '14')
        if not days.isdigit() or not 1 <= int(days) <= MAX_DAYS:
            raise ValidationError({'days': f'Must be a number from 1 to {MAX_DAYS}.'})
        staff = params.get('staff')
        if staff and not staff.isdigit():
            raise ValidationError({'staff': 'Must be a staff id.'})
        status = params.get('status', '')
        if status and status not in BookStatus.values:
            raise ValidationError({'status': f'Must be one of: {", ".join(BookStatus.values)}.'})
        return Response(build_report(int(days), params.get('shelf', '').strip().upper(), int(staff) if staff else None, status))
