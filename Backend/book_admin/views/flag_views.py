from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from authentication.permissions import IsAdminRole
from book_admin.models import ActivityLog, FlagCategory
from book_admin.serializers import BookSerializer, FlagCategorySerializer
from book_admin.services import book_queryset, review_flag
from book_admin.services.activity_service import log_activity
from book_admin.services.flag_service import overview

LIMIT = 500


def _with_stats(request, categories=None):
    return {'request': request, 'stats': overview(categories)['stats']}


class FlagCategoryListView(APIView):
    """GET  /api/admin/flag-categories/ -> every category with `matches` (active books it matches) and `awaiting` (held books waiting for review)
    POST /api/admin/flag-categories/ {name, description?, keywords: [..], mode: hold|label, enabled?} -> 201
    """

    permission_classes = [IsAdminRole]

    def get(self, request):
        return Response(FlagCategorySerializer(FlagCategory.objects.order_by('id'), many=True, context=_with_stats(request)).data)

    def post(self, request):
        serializer = FlagCategorySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        category = serializer.save()
        log_activity(action='Added flag category', kind=ActivityLog.Kind.FLAG, target=category.name, actor=request.user,
                     detail=f'{category.get_mode_display()} · {", ".join(category.keywords)}')
        return Response(FlagCategorySerializer(category, context=_with_stats(request)).data, status=status.HTTP_201_CREATED)


class FlagCategoryDetailView(APIView):
    """PATCH /api/admin/flag-categories/<id>/ {name?, description?, keywords?, mode?, enabled?} (enable / disable is just {enabled})"""

    permission_classes = [IsAdminRole]

    def patch(self, request, pk):
        category = FlagCategory.objects.filter(pk=pk).first()
        if category is None:
            raise NotFound('This flag category could not be found.')
        serializer = FlagCategorySerializer(category, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        before_enabled = category.enabled
        category = serializer.save()
        if set(request.data) == {'enabled'} and category.enabled != before_enabled:
            log_activity(action='Enabled flag category' if category.enabled else 'Disabled flag category', kind=ActivityLog.Kind.FLAG, target=category.name,
                         actor=request.user, result=ActivityLog.Result.INFO, detail='Matching books are flagged' if category.enabled else 'No longer applied')
        else:
            log_activity(action='Updated flag category', kind=ActivityLog.Kind.FLAG, target=category.name, actor=request.user, result=ActivityLog.Result.INFO,
                         detail=f'{category.get_mode_display()} · {len(category.keywords)} keywords')
        return Response(FlagCategorySerializer(category, context=_with_stats(request)).data)


class FlaggedBookListView(APIView):
    """GET /api/admin/flagged/?tab=review|reviewed|all&category=<id> -> {results: [books], counts: {review, reviewed, all}}

    review   = pending / waiting books held for a flag review; reviewed = flagged books that are labelled only or already reviewed.
    """

    permission_classes = [IsAdminRole]

    def get(self, request):
        tab = request.query_params.get('tab', 'review')
        if tab not in ('review', 'reviewed', 'all'):
            raise ValidationError({'tab': 'Must be review, reviewed or all.'})
        category = request.query_params.get('category', '')
        if category and not category.isdigit():
            raise ValidationError({'category': 'Must be a category id.'})
        data = overview()
        flags = data['flags']

        def keep(ids):
            return [i for i in ids if not category or any(f['id'] == int(category) for f in flags[i])]

        review, reviewed = keep(data['review']), keep(data['reviewed'])
        ids = review if tab == 'review' else reviewed if tab == 'reviewed' else review + reviewed
        rows = book_queryset().filter(id__in=ids).order_by('-submitted_at', '-id')[:LIMIT]
        context = {'request': request, 'flag_categories': data['categories']}
        return Response({
            'results': BookSerializer(rows, many=True, context=context).data,
            'counts': {'review': len(review), 'reviewed': len(reviewed), 'all': len(review) + len(reviewed)},
        })


class BookFlagReviewView(APIView):
    """POST /api/admin/books/<id>/flag-review/ {note?} -> the book, flag marked reviewed (409 {code: 'invalid_state'} if nothing is waiting)."""

    permission_classes = [IsAdminRole]

    def post(self, request, pk):
        review_flag(pk, request.user, str(request.data.get('note', '')))
        return Response(BookSerializer(book_queryset().get(pk=pk), context={'request': request}).data)
