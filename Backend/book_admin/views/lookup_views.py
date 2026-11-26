from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from authentication.permissions import IsAdminRole
from integrations.metadata import MetadataNotFound, MetadataUnavailable, find_description, lookup_isbn
from integrations.shopify.genres import start_store_check, store_guess
from inventory.services import to_isbn13
from staff_api.exceptions import InvalidIsbn, IsbnNotFound, MetadataServiceUnavailable


class IsbnRefreshView(APIView):
    """GET /api/admin/isbn/<isbn>/refresh/ -> the book details fetched again from the book sources (the saved lookup is
    skipped and replaced): the staff lookup's fields (title, author, publisher, year, pages, format, dimensions,
    subjects, genre, subgenres, language, genre_source, ...) plus `description`. For "Refresh details" on the admin
    review page, which fills the form's empty fields from it.
    400 {code: 'invalid_isbn'} · 404 {code: 'not_found'} · 503 {code: 'service_unavailable'}
    """

    permission_classes = [IsAdminRole]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'isbn_lookup'

    def get(self, request, isbn):
        isbn13 = to_isbn13(isbn)
        if not isbn13:
            raise InvalidIsbn
        store_check = start_store_check(isbn13)
        try:
            record = store_guess(lookup_isbn(isbn13, refresh=True), isbn=isbn13, store_check=store_check)
        except MetadataNotFound:
            raise IsbnNotFound from None
        except MetadataUnavailable:
            raise MetadataServiceUnavailable from None
        record['description'] = record.get('description') or find_description(isbn13, record.get('title', ''), record.get('author', ''))['description']
        return Response(record)
