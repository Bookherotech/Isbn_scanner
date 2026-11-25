from rest_framework import serializers

from book_admin.models import BlockedBook
from book_admin.utils.names import display_name
from inventory.services import to_isbn13


class BlockedBookSerializer(serializers.ModelSerializer):
    """GET / POST of a blocked book. POST takes the details the admin saw in the lookup; the ISBN may be ISBN-10."""

    added_by_name = serializers.SerializerMethodField()

    class Meta:
        model = BlockedBook
        fields = ['id', 'isbn', 'title', 'author', 'publisher', 'year', 'cover_url', 'reason', 'added_by_name', 'created_at']
        read_only_fields = ['id', 'added_by_name', 'created_at']
        extra_kwargs = {'isbn': {'validators': []}, 'year': {'min_value': 0, 'max_value': 9999}}

    def get_added_by_name(self, blocked):
        return display_name(blocked.added_by) if blocked.added_by_id else 'Unknown'

    def validate_isbn(self, value):
        isbn13 = to_isbn13(value)
        if not isbn13:
            raise serializers.ValidationError('This is not a valid ISBN. Check the number on the book.')
        if BlockedBook.objects.filter(isbn=isbn13).exists():
            raise serializers.ValidationError('This ISBN is already blocked.')
        return isbn13

    def validate(self, attrs):
        for key in ('title', 'author', 'publisher', 'reason'):
            attrs[key] = (attrs.get(key) or '').strip()
        return attrs
