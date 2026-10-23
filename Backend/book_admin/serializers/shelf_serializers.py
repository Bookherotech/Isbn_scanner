from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from rest_framework import serializers

from inventory.constants import ShelfStatus
from inventory.models import Shelf
from inventory.models.shelf import validate_shelf_code


class ShelfSerializer(serializers.ModelSerializer):
    """A shelf for the admin Shelves screen. `id` is the code ("A-03"), like the staff picker.

    titles / units / waiting / pending come from book_admin.services.shelves_with_stats (one query for all shelves).
    """

    id = serializers.CharField(source='code', read_only=True)
    titles = serializers.IntegerField(read_only=True, default=0)
    units = serializers.IntegerField(read_only=True, default=0)
    waiting = serializers.IntegerField(read_only=True, default=0)
    pending = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Shelf
        fields = ['id', 'code', 'zone', 'status', 'note', 'created_at', 'titles', 'units', 'waiting', 'pending']
        read_only_fields = fields


class ShelfWriteSerializer(serializers.Serializer):
    """POST /shelves/ {code, note?, status?} and PATCH /shelves/<code>/ {note?, status?}. The code never changes once created."""

    code = serializers.CharField(max_length=4, required=False)
    note = serializers.CharField(max_length=255, required=False, allow_blank=True)
    status = serializers.ChoiceField(choices=ShelfStatus.choices, required=False)

    def validate_code(self, value):
        code = value.strip().upper()
        try:
            validate_shelf_code(code)
        except DjangoValidationError as error:
            raise serializers.ValidationError(error.messages) from error
        if self.instance is not None:
            if code != self.instance.code:
                raise serializers.ValidationError('A shelf number cannot be changed.')
        elif Shelf.objects.filter(code=code).exists():
            raise serializers.ValidationError(f'Shelf {code} already exists.')
        return code

    def validate(self, attrs):
        if self.instance is None and 'code' not in attrs:
            raise serializers.ValidationError({'code': ['Shelf number is required.']})
        return attrs

    def create(self, validated_data):
        try:
            return Shelf.objects.create(**validated_data)
        except IntegrityError as error:  # created a moment ago by someone else
            raise serializers.ValidationError({'code': [f'Shelf {validated_data["code"]} already exists.']}) from error

    def update(self, instance, validated_data):
        validated_data.pop('code', None)
        changed = [f for f, v in validated_data.items() if getattr(instance, f) != v]
        for field in changed:
            setattr(instance, field, validated_data[field])
        if changed:
            instance.save(update_fields=changed)
        return instance
