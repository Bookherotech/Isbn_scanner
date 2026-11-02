from rest_framework import serializers

from inventory.models import Book


class BookViewSerializer(serializers.ModelSerializer):
    """Any staff member can read this about a book on sale: no submitter, admin or review details."""

    shelf_id = serializers.CharField(source='shelf.code', read_only=True)
    cover_photo_url = serializers.SerializerMethodField()

    class Meta:
        model = Book
        fields = ['id', 'isbn', 'title', 'author', 'publisher', 'year', 'pages', 'description', 'cover_url', 'cover_photo_url', 'shelf_id', 'quantity', 'stock', 'status']
        read_only_fields = fields

    def get_cover_photo_url(self, book):
        """Full URL of the staff photo, else our copy of the provider cover ('' when there is neither)."""
        cover = book.cover_photo or book.cached_cover
        if not cover:
            return ''
        request = self.context.get('request')
        return request.build_absolute_uri(cover.url) if request else cover.url
