import re

from rest_framework import serializers

from inventory.constants import BookSource, ShelfStatus
from inventory.models import Shelf
from inventory.services import InvalidCoverPhoto, clean_cover_photo, to_isbn13

METADATA_FIELDS = ('title', 'author', 'publisher', 'year', 'pages')
MAX_QUANTITY = 500


def _optional_number(value, pattern, message):
    """'' / None -> None; '2018' or 2018 -> 2018; anything else -> a validation error."""
    text = '' if value is None else str(value).strip()
    if text == '':
        return None
    if not re.fullmatch(pattern, text):
        raise serializers.ValidationError(message)
    return int(text)


class SubmissionCreateSerializer(serializers.Serializer):
    """POST /api/staff/submissions/ body. Same rules as the staff screens, checked again on the server."""

    isbn = serializers.CharField(max_length=17)
    title = serializers.CharField(max_length=255, error_messages={'blank': 'Title is required.', 'required': 'Title is required.'})
    author = serializers.CharField(max_length=255, error_messages={'blank': 'Author is required.', 'required': 'Author is required.'})
    publisher = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')
    year = serializers.CharField(required=False, allow_blank=True, allow_null=True, default=None)
    pages = serializers.CharField(required=False, allow_blank=True, allow_null=True, default=None)
    source = serializers.ChoiceField(choices=BookSource.choices, default=BookSource.MANUAL)
    subjects = serializers.ListField(child=serializers.CharField(max_length=100), required=False, default=list, max_length=50)
    fetched = serializers.DictField(required=False, allow_null=True, default=None)
    # A cover photo taken by staff, as a data URL ('data:image/jpeg;base64,...'); re-encoded on the server.
    cover_photo = serializers.CharField(required=False, allow_blank=True, default='', trim_whitespace=True)
    shelf_id = serializers.CharField(max_length=10, error_messages={'blank': 'Choose the shelf this book is on.', 'required': 'Choose the shelf this book is on.'})
    quantity = serializers.IntegerField(
        min_value=1, max_value=MAX_QUANTITY,
        error_messages={'min_value': 'Quantity must be at least 1.', 'max_value': f'Quantity can be at most {MAX_QUANTITY}.'},
    )

    def validate_isbn(self, value):
        isbn13 = to_isbn13(value)
        if not isbn13:
            raise serializers.ValidationError('Enter a valid ISBN-10 or ISBN-13.')
        return isbn13

    def validate_year(self, value):
        return _optional_number(value, r'\d{4}', 'Use a 4-digit year.')

    def validate_pages(self, value):
        return _optional_number(value, r'\d{1,6}', 'Numbers only.')

    def validate_shelf_id(self, value):
        shelf = Shelf.objects.filter(code=value.strip().upper(), status=ShelfStatus.ACTIVE).first()
        if shelf is None:
            raise serializers.ValidationError('This shelf does not exist or is not active. Choose another shelf.')
        return shelf

    def validate_cover_photo(self, value):
        if not value:
            return None
        try:
            return clean_cover_photo(value)
        except InvalidCoverPhoto as error:
            raise serializers.ValidationError(str(error)) from None

    def validate_fetched(self, value):
        """Keep only the five metadata fields and the first ISBN, as plain short values (used to mark edited fields)."""
        if not value:
            return None
        clean = {'isbn': to_isbn13(value.get('isbn')) or ''}
        for key in METADATA_FIELDS:
            item = value.get(key)
            if isinstance(item, bool) or item is None:
                clean[key] = ''
            elif isinstance(item, int):
                clean[key] = item
            else:
                clean[key] = str(item).strip()[:255]
        return clean

    def validate(self, attrs):
        if attrs['source'] == BookSource.MANUAL:
            attrs['fetched'] = None  # typed by hand: nothing was fetched
            attrs['subjects'] = []
        attrs['publisher'] = attrs['publisher'].strip()
        return attrs
