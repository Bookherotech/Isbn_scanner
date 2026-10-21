from rest_framework.generics import ListAPIView

from inventory.constants import ShelfStatus
from inventory.models import Shelf
from staff_api.permissions import IsStaffRole
from staff_api.serializers import ShelfSerializer


class ShelfListView(ListAPIView):
    """GET /api/staff/shelves/ -> every active shelf, by code (a short list: not paginated)."""

    permission_classes = [IsStaffRole]
    serializer_class = ShelfSerializer
    pagination_class = None
    queryset = Shelf.objects.filter(status=ShelfStatus.ACTIVE).only('code', 'zone', 'status').order_by('code')
