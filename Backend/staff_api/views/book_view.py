from rest_framework.exceptions import NotFound
from rest_framework.generics import RetrieveAPIView

from inventory.constants import BookStatus
from inventory.models import Book
from staff_api.permissions import IsStaffRole
from staff_api.serializers import BookViewSerializer

ON_SALE_OR_SOLD = (BookStatus.LIVE, BookStatus.OUT_OF_STOCK, BookStatus.CLOSED)


class BookView(RetrieveAPIView):
    """GET /api/staff/books/<id>/ -> a read-only view of an approved book, for the stock alerts every staff member gets.

    Pending, waiting and rejected entries give 404: those stay private to the staff member who submitted them.
    """

    permission_classes = [IsStaffRole]
    serializer_class = BookViewSerializer

    def get_object(self):
        book = Book.objects.select_related('shelf').filter(pk=self.kwargs['pk'], status__in=ON_SALE_OR_SOLD).first()
        if book is None:
            raise NotFound('This book could not be found.')
        return book
