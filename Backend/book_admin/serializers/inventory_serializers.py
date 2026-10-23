import re

from rest_framework import serializers

from book_admin.models import ActivityLog
from book_admin.services.flag_service import load_categories, match_flags, needs_review
from book_admin.services.rejection_reasons import REJECTION_REASONS
from book_admin.serializers.activity_serializers import ActivitySerializer
from book_admin.utils import display_name
from inventory.constants import ShelfStatus
from inventory.models import Book, Shelf
from inventory.services import duplicate_key, find_duplicates, match_summary, normalize_author, normalize_title

MAX_QUANTITY = 500


class BookSerializer(serializers.ModelSerializer):
    """One book entry as the admin screens show it.

    Expects a queryset from book_admin.services.book_queryset (every related row joined: no N+1).
    """

    shelf_id = serializers.CharField(source='shelf.code', read_only=True)
    previous_shelf_id = serializers.CharField(source='previous_shelf.code', read_only=True, allow_null=True)
    ready = serializers.SerializerMethodField()
    linked = serializers.SerializerMethodField()
    submitted_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    rejected_by_name = serializers.SerializerMethodField()
    cover_photo_url = serializers.SerializerMethodField()
    flags = serializers.SerializerMethodField()
    flag_hold = serializers.SerializerMethodField()
    flag_reviewed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Book
        fields = [
            'id', 'isbn', 'title', 'author', 'publisher', 'year', 'pages', 'source', 'subjects', 'cover_url', 'cover_photo_url',
            'fetched', 'edited_fields', 'missing_fields', 'shelf_id', 'previous_shelf_id', 'quantity', 'stock', 'status', 'ready', 'linked', 'match',
            'submitted_by', 'submitted_by_name', 'submitted_at', 'approved_by', 'approved_by_name', 'approved_at',
            'rejected_by', 'rejected_by_name', 'rejected_at', 'auto_rejected', 'reject_reason', 'reject_note',
            'waiting_ready_at', 'product_id', 'sync_status', 'last_sync_at', 'sync_error',
            'stock_out_at', 'closed_at', 'closed_reason', 'flags', 'flag_hold', 'flag_reviewed_at', 'flag_reviewed_by_name', 'flag_note',
        ]
        read_only_fields = fields

    def get_cover_photo_url(self, book):
        if not book.cover_photo:
            return ''
        request = self.context.get('request')
        return request.build_absolute_uri(book.cover_photo.url) if request else book.cover_photo.url

    def get_ready(self, book):
        """A waiting-list entry is ready once the entry it waits behind has sold out."""
        return book.status == 'waiting' and book.linked_item is not None and book.linked_item.status == 'out_of_stock'

    def get_linked(self, book):
        linked = book.linked_item
        if linked is None:
            return None
        return {
            'id': linked.id, 'shelf_id': linked.shelf.code, 'status': linked.status, 'stock': linked.stock,
            'quantity': linked.quantity, 'product_id': linked.product_id, 'stock_out_at': linked.stock_out_at,
        }

    def get_submitted_by_name(self, book):
        return display_name(book.submitted_by)

    def get_approved_by_name(self, book):
        return display_name(book.approved_by) if book.approved_at else None

    def get_rejected_by_name(self, book):
        if not book.rejected_at:
            return None
        return 'System' if book.auto_rejected else display_name(book.rejected_by)

    def _flags(self, book):
        """The categories are loaded once per request and shared by every book in it (context is shared by the list's children)."""
        if 'flag_categories' not in self.context:
            self.context['flag_categories'] = load_categories()
        return match_flags(book.title, book.subjects, self.context['flag_categories'])

    def get_flags(self, book):
        return self._flags(book)

    def get_flag_hold(self, book):
        return needs_review(book.status, book.flag_reviewed_at, self._flags(book))

    def get_flag_reviewed_by_name(self, book):
        return display_name(book.flag_reviewed_by) if book.flag_reviewed_at else None


class WaitingEntrySerializer(serializers.ModelSerializer):
    """A waiting-list entry listed under the book it waits behind."""

    shelf_id = serializers.CharField(source='shelf.code', read_only=True)
    submitted_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Book
        fields = ['id', 'shelf_id', 'quantity', 'submitted_by', 'submitted_by_name', 'submitted_at']
        read_only_fields = fields

    def get_submitted_by_name(self, book):
        return display_name(book.submitted_by)


class BookWithWaitingSerializer(BookSerializer):
    """BookSerializer plus the waiting entries behind it. Needs `open_waiting` (see book_admin.services.with_open_waiting)."""

    waiting_entries = serializers.SerializerMethodField()

    class Meta(BookSerializer.Meta):
        fields = [*BookSerializer.Meta.fields, 'waiting_entries']
        read_only_fields = fields

    def get_waiting_entries(self, book):
        return WaitingEntrySerializer(book.open_waiting, many=True).data


class BookDetailSerializer(BookWithWaitingSerializer):
    """The book page: everything above, the shelf history of its Shopify product, and the duplicate check."""

    shelf_history = serializers.SerializerMethodField()
    duplicate_check = serializers.SerializerMethodField()
    activity = serializers.SerializerMethodField()

    class Meta(BookWithWaitingSerializer.Meta):
        fields = [*BookWithWaitingSerializer.Meta.fields, 'shelf_history', 'duplicate_check', 'activity']
        read_only_fields = fields

    def get_shelf_history(self, book):
        if not book.product_id:
            return []
        rows = Book.objects.filter(product_id=book.product_id).select_related('shelf').order_by('approved_at', 'id')
        return [
            {'id': b.id, 'shelf_id': b.shelf.code, 'status': b.status, 'quantity': b.quantity, 'stock': b.stock, 'approved_at': b.approved_at, 'closed_at': b.closed_at}
            for b in rows
        ]

    def get_activity(self, book):
        rows = ActivityLog.objects.filter(book=book).select_related('actor').order_by('-created_at', '-id')[:12]
        return ActivitySerializer(rows, many=True).data

    def get_duplicate_check(self, book):
        dup = find_duplicates(book.title, book.author, book.shelf_id, exclude_id=book.id)
        return {
            'key': {'title': normalize_title(book.title), 'author': normalize_author(book.author)},
            'matches': [match_summary(m) for m in dup.matches],  # find_duplicates joins each match's shelf
        }


def _optional_number(value, pattern, message):
    """'' / None -> None; '2018' or 2018 -> 2018; anything else -> a validation error."""
    text = '' if value is None else str(value).strip()
    if text == '':
        return None
    if not re.fullmatch(pattern, text):
        raise serializers.ValidationError(message)
    return int(text)


class BookUpdateSerializer(serializers.Serializer):
    """PATCH /books/<id>/ body: any of the fields the review screen edits. Pass the book as context['book']."""

    title = serializers.CharField(max_length=255, error_messages={'blank': 'Title is required.'})
    author = serializers.CharField(max_length=255, error_messages={'blank': 'Author is required.'})
    publisher = serializers.CharField(max_length=255, allow_blank=True)
    year = serializers.CharField(allow_blank=True, allow_null=True)
    pages = serializers.CharField(allow_blank=True, allow_null=True)
    shelf_id = serializers.CharField(max_length=10)
    quantity = serializers.IntegerField(
        min_value=1, max_value=MAX_QUANTITY,
        error_messages={'min_value': 'Quantity must be at least 1.', 'max_value': f'Quantity can be at most {MAX_QUANTITY}.'},
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for field in self.fields.values():
            field.required = False

    def validate_publisher(self, value):
        return value.strip()

    def validate_year(self, value):
        return _optional_number(value, r'\d{4}', 'Use a 4-digit year.')

    def validate_pages(self, value):
        return _optional_number(value, r'\d{1,6}', 'Numbers only.')

    def validate_shelf_id(self, value):
        code = value.strip().upper()
        book = self.context.get('book')
        if book is not None and book.shelf.code == code:
            return book.shelf  # keeping the current shelf is always fine, even if it was deactivated since
        shelf = Shelf.objects.filter(code=code, status=ShelfStatus.ACTIVE).first()
        if shelf is None:
            raise serializers.ValidationError('This shelf does not exist or is not active. Choose another shelf.')
        return shelf


class BookRejectSerializer(serializers.Serializer):
    """POST /books/<id>/reject/ {reason, note?}. "Other" needs a note: the staff member reads it."""

    reason = serializers.ChoiceField(choices=REJECTION_REASONS)
    note = serializers.CharField(required=False, allow_blank=True, default='')

    def validate(self, attrs):
        attrs['reason'], attrs['note'] = attrs['reason'].strip(), attrs['note'].strip()
        if attrs['reason'] == 'Other' and not attrs['note']:
            raise serializers.ValidationError({'note': ['Describe the reason.']})
        return attrs
