from django.db.models import Count
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from integrations.metadata import cached_metadata
from inventory.constants import BookSource, BookStatus
from inventory.services import DuplicateCheckBusy, create_submission, normalize_author, normalize_title
from staff_api.exceptions import SubmissionBusy
from staff_api.permissions import IsStaffRole
from staff_api.serializers import SubmissionCreateSerializer, SubmissionSerializer
from staff_api.services import my_submissions

DEFAULT_LIMIT = 12
MAX_LIMIT = 500


class SubmissionListView(APIView):
    """The signed-in staff member's own submissions.

    GET  /api/staff/submissions/?status=all|pending|waiting|live|out_of_stock|rejected|closed&limit=12
         -> {results, count, counts: {all, pending, ...}}   newest first; "Show more" asks for a bigger limit
            (capped at MAX_LIMIT rows)
    POST /api/staff/submissions/ {isbn, title, author, publisher?, year?, pages?, source, subjects?, fetched?, cover_photo?, shelf_id, quantity}
         (fetched may include the first ISBN; cover_photo is a data URL, re-encoded to JPEG)
         -> 201 {result: pending|waiting|rejected, match, ready, flags, flag_hold, item, key: {title, author}}
    """

    permission_classes = [IsStaffRole]

    def get(self, request):
        params = request.query_params
        wanted = params.get('status', 'all')
        if wanted != 'all' and wanted not in BookStatus.values:
            raise ValidationError({'status': f'Must be all or one of: {", ".join(BookStatus.values)}.'})
        try:
            limit = int(params.get('limit', DEFAULT_LIMIT))
        except ValueError:
            raise ValidationError({'limit': 'Must be a number.'}) from None
        if limit < 1:
            raise ValidationError({'limit': 'Must be at least 1.'})
        limit = min(limit, MAX_LIMIT)  # "Show more" can keep asking; at most MAX_LIMIT rows come back

        mine = my_submissions(request.user)
        # One GROUP BY query gives the tab counts and the total.
        counts = dict(mine.order_by().values_list('status').annotate(n=Count('id')))
        counts['all'] = sum(counts.values())

        rows = mine if wanted == 'all' else mine.filter(status=wanted)
        rows = rows.order_by('-submitted_at', '-id')[:limit]
        return Response({
            'results': SubmissionSerializer(rows, many=True, context={'request': request}).data,
            'count': counts.get(wanted, 0),
            'counts': counts,
        })

    def post(self, request):
        serializer = SubmissionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        cover_url = ''
        if data['source'] != BookSource.MANUAL:
            cover_url = (cached_metadata(data['isbn']) or {}).get('cover_url', '')  # from the lookup a moment ago

        try:
            outcome = create_submission(
                user=request.user, shelf=data['shelf_id'], isbn=data['isbn'], title=data['title'], author=data['author'],
                publisher=data['publisher'], year=data['year'], pages=data['pages'], source=data['source'],
                subjects=data['subjects'], fetched=data['fetched'], cover_url=cover_url, cover_photo=data['cover_photo'],
                quantity=data['quantity'],
            )
        except DuplicateCheckBusy:
            raise SubmissionBusy from None
        return Response({
            'result': outcome.result,
            'match': outcome.match,
            'ready': outcome.ready,
            'flags': [],  # content flags: later
            'flag_hold': False,
            'item': SubmissionSerializer(outcome.book, context={'request': request}).data,
            'key': {'title': normalize_title(outcome.book.title), 'author': normalize_author(outcome.book.author)},
        }, status=status.HTTP_201_CREATED)
