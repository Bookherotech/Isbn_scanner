from rest_framework.response import Response
from rest_framework.views import APIView

from integrations.shopify.genres import store_genres
from staff_api.permissions import IsStaffRole


class GenreListView(APIView):
    """GET /api/staff/genres/ -> {genres, languages, source}: the store's genre tags for the dropdowns ('source': 'shopify' | 'default')."""

    permission_classes = [IsStaffRole]

    def get(self, request):
        return Response(store_genres())
