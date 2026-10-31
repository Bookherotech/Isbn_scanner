from rest_framework import serializers

from book_admin.services.flag_service import load_categories, match_flags, needs_review
from inventory.constants import BookStatus
from inventory.models import Book


def display_name(user):
    if user is None:
        return 'Unknown'
    return user.full_name or user.email.split('@')[0]


class SubmissionSerializer(serializers.ModelSerializer):
    """One of the staff member's submissions, as the staff screens show it.

    Expects the queryset from staff_api.services.my_submissions (related rows already joined: no N+1).
    """

    shelf_id = serializers.CharField(source='shelf.code', read_only=True)
    ready = serializers.SerializerMethodField()
    linked = serializers.SerializerMethodField()
    submitted_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    rejected_by_name = serializers.SerializerMethodField()
    flags = serializers.SerializerMethodField()
    flag_hold = serializers.SerializerMethodField()
    cover_photo_url = serializers.SerializerMethodField()

    class Meta:
        model = Book
        fields = [
            'id', 'isbn', 'title', 'author', 'publisher', 'year', 'pages', 'source', 'subjects', 'cover_url', 'cover_photo_url',
            'edited_fields', 'missing_fields', 'shelf_id', 'quantity', 'stock', 'status', 'ready', 'linked', 'match',
            'submitted_at', 'submitted_by_name', 'approved_at', 'approved_by_name',
            'rejected_at', 'rejected_by_name', 'auto_rejected', 'reject_reason', 'reject_note',
            'waiting_ready_at', 'stock_out_at', 'closed_at', 'flags', 'flag_hold',
        ]
        read_only_fields = fields

    def get_cover_photo_url(self, book):
        """Full URL of the staff photo, else our copy of the provider cover ('' when there is neither). Needs the request in the serializer context."""
        cover = book.cover_photo or book.cached_cover
        if not cover:
            return ''
        request = self.context.get('request')
        return request.build_absolute_uri(cover.url) if request else cover.url

    def get_ready(self, book):
        """A waiting-list entry is ready for approval once the entry it waits behind has sold out."""
        return book.status == BookStatus.WAITING and book.linked_item is not None and book.linked_item.status == BookStatus.OUT_OF_STOCK

    def get_linked(self, book):
        linked = book.linked_item
        if linked is None:
            return None
        return {'id': linked.id, 'shelf_id': linked.shelf.code, 'status': linked.status, 'stock': linked.stock, 'quantity': linked.quantity}

    def get_submitted_by_name(self, book):
        return display_name(book.submitted_by)

    def get_approved_by_name(self, book):
        return display_name(book.approved_by) if book.approved_at else None

    def get_rejected_by_name(self, book):
        if not book.rejected_at:
            return None
        return 'System' if book.auto_rejected else display_name(book.rejected_by)

    def _flags(self, book):
        """Content flags (the admin's categories). Loaded once per request: the list's children share the context."""
        if 'flag_categories' not in self.context:
            self.context['flag_categories'] = load_categories()
        return match_flags(book.title, book.subjects, self.context['flag_categories'])

    def get_flags(self, book):
        return self._flags(book)

    def get_flag_hold(self, book):
        """True while the book waits for an admin's flag review."""
        return needs_review(book.status, book.flag_reviewed_at, self._flags(book))
