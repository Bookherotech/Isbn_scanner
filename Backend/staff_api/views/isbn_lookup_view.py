from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from book_admin.services.blocked_books import blocked_book, blocked_summary
from integrations.metadata import MetadataNotFound, MetadataUnavailable, lookup_isbn
from integrations.shopify.genres import start_store_check, store_guess
from inventory.services import to_isbn13
from staff_api.exceptions import BookBlocked, InvalidIsbn, IsbnNotFound, MetadataServiceUnavailable
from staff_api.permissions import IsStaffRole


class IsbnLookupView(APIView):
    """GET /api/staff/isbn/<isbn>/ -> book details for a scanned or typed ISBN (ISBN-10 is converted).

    200 {isbn, title, author, publisher, year, pages, subjects, cover_url, source, fallback, missing, filled, genre, subgenres, language, genre_source}
    genre / subgenres / language: from the store's own Shopify product when it has this ISBN (genre_source 'shopify'), else guessed
    from the book data and matched to the store's genres ('guess'); staff confirm them.
    409 {code: 'blocked', blocked: {isbn, title, author, reason}}: on the admin's Blocked books list, nothing is looked up
    400 {code: 'invalid_isbn'} · 404 {code: 'not_found'} · 503 {code: 'service_unavailable'} (retry may work)
    """

    permission_classes = [IsStaffRole]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'isbn_lookup'  # protects the external providers' quota; rate set in settings

    def get(self, request, isbn):
        isbn13 = to_isbn13(isbn)
        if not isbn13:
            raise InvalidIsbn
        blocked = blocked_book(isbn13)
        if blocked:
            raise BookBlocked(blocked_summary(blocked))
        store_check = start_store_check(isbn13)  # Shopify is asked while the book data is looked up
        try:
            return Response(store_guess(lookup_isbn(isbn13), isbn=isbn13, store_check=store_check))
        except MetadataNotFound:
            raise IsbnNotFound from None
        except MetadataUnavailable:
            raise MetadataServiceUnavailable from None
