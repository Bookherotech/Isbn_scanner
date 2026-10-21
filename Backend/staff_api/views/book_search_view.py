from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from integrations.metadata import MetadataUnavailable, search_books
from staff_api.exceptions import MetadataServiceUnavailable, TitleTooShort
from staff_api.permissions import IsStaffRole

MIN_TITLE = 3
MAX_TEXT = 200


class BookSearchView(APIView):
    """GET /api/staff/book-search/?title=&author= -> {results: [{title, author, publisher, year, pages, subjects, cover_url}]}

    Suggestions while staff type a book in by hand (or fill fields the ISBN lookup did not have).
    The results never include an ISBN: the scanned ISBN is always the one kept.
    400 {code: 'title_too_short'} · 503 {code: 'service_unavailable'}
    """

    permission_classes = [IsStaffRole]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'book_search'  # rate set in settings; protects the Google Books daily quota

    def get(self, request):
        title = request.query_params.get('title', '').strip()[:MAX_TEXT]
        author = request.query_params.get('author', '').strip()[:MAX_TEXT]
        if len(title) < MIN_TITLE:
            raise TitleTooShort
        try:
            return Response({'results': search_books(title, author)})
        except MetadataUnavailable:
            raise MetadataServiceUnavailable from None
