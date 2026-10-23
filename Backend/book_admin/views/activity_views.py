from django.db.models import Q
from rest_framework.exceptions import ValidationError
from rest_framework.generics import ListAPIView

from authentication.permissions import IsAdminRole
from book_admin.models import ActivityLog
from book_admin.paginations import ActivityPagination
from book_admin.serializers import ActivitySerializer


class ActivityListView(ListAPIView):
    """GET /api/admin/activity/?q=&type=&actor=&page=&page_size=  (newest first)

    type: submission|approval|rejection|waiting|stock|notification|shopify|flag|edit|shelf|staff|settings
    actor: a user id, or system / shopify
    -> {results: [{id, created_at, actor, actor_type, actor_name, action, object, detail, kind, result, book_id}], total, page, pages, page_size}
    """

    permission_classes = [IsAdminRole]
    serializer_class = ActivitySerializer
    pagination_class = ActivityPagination

    def get_queryset(self):
        params = self.request.query_params
        rows = ActivityLog.objects.select_related('actor')
        kind = params.get('type')
        if kind:
            if kind not in ActivityLog.Kind.values:
                raise ValidationError({'type': f'Must be one of: {", ".join(ActivityLog.Kind.values)}.'})
            rows = rows.filter(kind=kind)
        actor = params.get('actor')
        if actor in ActivityLog.ActorType.values and actor != ActivityLog.ActorType.USER:
            rows = rows.filter(actor_type=actor)
        elif actor:
            if not actor.isdigit():
                raise ValidationError({'actor': 'Must be a user id, system or shopify.'})
            rows = rows.filter(actor_id=int(actor))
        text = params.get('q', '').strip()
        if text:
            rows = rows.filter(Q(action__icontains=text) | Q(target__icontains=text) | Q(detail__icontains=text) | Q(actor__full_name__icontains=text))
        return rows.order_by('-created_at', '-id')
