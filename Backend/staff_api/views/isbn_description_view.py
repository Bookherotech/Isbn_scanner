from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from integrations.metadata import find_description
from inventory.services import to_isbn13
from staff_api.exceptions import InvalidIsbn
from staff_api.permissions import IsStaffRole

MAX_TEXT = 200


class IsbnDescriptionView(APIView):
    """GET /api/staff/isbn/<isbn>/description/?title=&author= -> {description, source} (both '' when there is none).

    Asked for after the book's details are on screen, because it can take several seconds. 400 {code: 'invalid_isbn'}
    """

    permission_classes = [IsStaffRole]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'isbn_lookup'  # protects the external providers' quota; rate set in settings

    def get(self, request, isbn):
        isbn13 = to_isbn13(isbn)
        if not isbn13:
            raise InvalidIsbn
        title = request.query_params.get('title', '').strip()[:MAX_TEXT]
        author = request.query_params.get('author', '').strip()[:MAX_TEXT]
        return Response(find_description(isbn13, title, author))
