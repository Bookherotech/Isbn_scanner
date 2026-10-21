from rest_framework.exceptions import NotFound
from rest_framework.generics import RetrieveAPIView

from staff_api.permissions import IsStaffRole
from staff_api.serializers import SubmissionSerializer
from staff_api.services import my_submissions


class SubmissionDetailView(RetrieveAPIView):
    """GET /api/staff/submissions/<id>/ -> one of your own submissions (another staff member's gives 404)."""

    permission_classes = [IsStaffRole]
    serializer_class = SubmissionSerializer

    def get_queryset(self):
        return my_submissions(self.request.user)

    def get_object(self):
        book = self.get_queryset().filter(pk=self.kwargs['pk']).first()
        if book is None:
            raise NotFound('This submission could not be found.')
        return book
