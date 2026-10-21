from rest_framework import serializers

from inventory.models import Shelf


class ShelfSerializer(serializers.ModelSerializer):
    """A shelf for the staff shelf picker. `id` is the code ("A-03"): screens identify shelves by code."""

    id = serializers.CharField(source='code', read_only=True)

    class Meta:
        model = Shelf
        fields = ['id', 'code', 'zone', 'status']
        read_only_fields = fields
