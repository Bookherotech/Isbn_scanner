from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from integrations.metadata import MetadataNotFound, MetadataUnavailable, lookup_isbn
from inventory.services import to_isbn13
from staff_api.exceptions import InvalidIsbn, IsbnNotFound, MetadataServiceUnavailable
from staff_api.permissions import IsStaffRole


class IsbnLookupView(APIView):
    """GET /api/staff/isbn/<isbn>/ -> book details for a scanned or typed ISBN (ISBN-10 is converted).

    200 {isbn, title, author, publisher, year, pages, subjects, cover_url, source, fallback, missing}
    400 {code: 'invalid_isbn'} · 404 {code: 'not_found'} · 503 {code: 'service_unavailable'} (retry may work)
    """

    permission_classes = [IsStaffRole]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'isbn_lookup'  # protects the external providers' quota; rate set in settings

    def get(self, request, isbn):
        isbn13 = to_isbn13(isbn)
        if not isbn13:
            raise InvalidIsbn
        try:
            return Response(lookup_isbn(isbn13))
        except MetadataNotFound:
            raise IsbnNotFound from None
        except MetadataUnavailable:
            raise MetadataServiceUnavailable from None
